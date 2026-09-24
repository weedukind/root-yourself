// Fehlerformat der REST-API, von Server und Admin-Oberfläche gemeinsam genutzt.

export type ErrorKind = "invalid" | "not_found" | "conflict";

export type FieldIssue = { field: string; message: string };

export type ApiError = {
  kind: ErrorKind;
  code: string;
  message: string;
  field?: string;
  issues?: FieldIssue[];
};

export type ApiErrorBody = { error: ApiError };
