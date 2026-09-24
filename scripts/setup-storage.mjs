// Richtet den Bucket für die Mediathek ein (idempotent): anlegen, öffentliches Lesen,
// CORS für Uploads aus dem Browser. Lokal startet docker-compose.dev.yml das automatisch.
// Für Cloudflare R2 dieselben Einstellungen einmalig mit den R2-Zugangsdaten ausführen.
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} ist nicht gesetzt`);
  return value;
};

const bucket = env("S3_BUCKET");
const s3 = new S3Client({
  endpoint: env("S3_ENDPOINT"),
  region: process.env.S3_REGION ?? "auto",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId: env("S3_ACCESS_KEY_ID"), secretAccessKey: env("S3_SECRET_ACCESS_KEY") },
});

// Der Speicher-Container braucht nach dem Start einen Moment.
for (let attempt = 1; ; attempt++) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    break;
  } catch (error) {
    if (error.$metadata?.httpStatusCode === 404) {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      console.log(`Bucket ${bucket} angelegt`);
      break;
    }
    if (attempt === 30) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

// Bilder sind öffentlich lesbar; geschrieben wird nur per Presigned URL vom Backend.
// Bei R2 stattdessen eine eigene Domain am Bucket aktivieren (R2 kennt keine Bucket-Policies).
if (process.env.S3_SKIP_POLICY !== "true") {
  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          { Effect: "Allow", Principal: { AWS: ["*"] }, Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${bucket}/*`] },
        ],
      }),
    }),
  );
}

await s3.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: env("MEDIA_CORS_ORIGINS").split(","),
          AllowedMethods: ["PUT"],
          AllowedHeaders: ["content-type"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);

console.log(`Bucket ${bucket} eingerichtet`);
