export const en = {
  "app.name": "Migite",
  "error.configMissingFile": "missing or unreadable file",
  "error.duplicateProviderId": "duplicate provider id: {id}",
  "error.emptyValue": "must not be empty",
  "error.envInvalidName": "line {line}: invalid variable name",
  "error.envInvalidPort": "line {line}: PORT must be an integer between 1 and 65535",
  "error.envMissingEquals": 'line {line}: missing "="',
  "error.genericError": "An unexpected error occurred",
  "error.invalidConfig": "Invalid configuration in {path}",
  "error.invalidEnvVarName": "invalid environment variable name",
  "error.invalidHttpUrl": "must be a valid http or https URL",
  "error.invalidPort":
    "Invalid PORT: {value} is not an integer between 1 and 65535 (default value: {defaultValue})",
  "error.invalidTimeZone": "unrecognized IANA time zone",
  "error.invalidYamlSyntax": "invalid YAML syntax",
  "error.invalidYamlSyntaxAt": "invalid YAML syntax ({code}, line {line}, column {column})",
  "error.invalidYamlSyntaxCode": "invalid YAML syntax ({code})",
  "error.missingProvider": "must declare at least one provider",
  "error.portInUse": "the port is already in use (EADDRINUSE)",
  "error.portPermissionDenied": "no permission to listen on the port (EACCES)",
  "error.portUnavailable": "the network address is not available (EADDRNOTAVAIL)",
  "error.serverStartFailed": "The server could not be started: {detail}",
  "error.translationKeyMissing": 'key "{key}" present in [{presentIn}] but missing in [{absentIn}]',
  "error.undeclaredProvider": "provider {provider} is not declared in providers",
  "warning.missingApiKey":
    "Warning: the environment variable {variable} (API key) is not set. The app works, but the AI agent will be unavailable.",
  "web.containerNotFound": "Root container #root not found",
  "web.m0Status": "Monorepo in preparation (M0).",
  "web.tagline": "Your right hand, for whatever you need.",
  "web.title": "Migite 0.1",
};

export type TranslationKey = keyof typeof en;
