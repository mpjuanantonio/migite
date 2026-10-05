import type { TranslationKey } from "./en.js";

export const es = {
  "app.name": "Migite",
  "error.configMissingFile": "fichero ausente o ilegible",
  "error.duplicateProviderId": "id de proveedor duplicado: {id}",
  "error.emptyValue": "no puede estar vacío",
  "error.envInvalidName": "línea {line}: nombre de variable inválido",
  "error.envInvalidPort": "línea {line}: PORT debe ser un entero entre 1 y 65535",
  "error.envMissingEquals": "línea {line}: falta «=»",
  "error.genericError": "Se ha producido un error inesperado",
  "error.invalidConfig": "Configuración inválida en {path}",
  "error.invalidEnvVarName": "nombre de variable de entorno inválido",
  "error.invalidHttpUrl": "debe ser una URL http o https válida",
  "error.invalidPort":
    "PORT inválido: «{value}» no es un entero entre 1 y 65535 (valor por defecto: {defaultValue})",
  "error.invalidTimeZone": "zona horaria IANA no reconocida",
  "error.invalidYamlSyntax": "sintaxis YAML inválida",
  "error.invalidYamlSyntaxAt": "sintaxis YAML inválida ({code}, línea {line}, columna {column})",
  "error.invalidYamlSyntaxCode": "sintaxis YAML inválida ({code})",
  "error.missingProvider": "debe declarar al menos un proveedor",
  "error.portInUse": "el puerto ya está en uso (EADDRINUSE)",
  "error.portPermissionDenied": "no hay permisos para escuchar en el puerto (EACCES)",
  "error.portUnavailable": "la dirección de red no está disponible (EADDRNOTAVAIL)",
  "error.serverStartFailed": "No se pudo iniciar el servidor: {detail}",
  "error.translationKeyMissing":
    'clave "{key}" presente en [{presentIn}] pero ausente en [{absentIn}]',
  "error.typeSeedFailed": "No se pudieron sembrar los tipos nativos en {path}: {problems}",
  "error.undeclaredProvider": "el proveedor {provider} no está declarado en proveedores",
  "warning.missingApiKey":
    "Aviso: no está definida la variable de entorno {variable} (clave API). La app funciona, pero el agente de IA quedará inoperativo.",
  "web.containerNotFound": "No se encontro el contenedor #root",
  "web.m0Status": "Monorepo en preparacion (M0).",
  "web.tagline": "Tu mano derecha, siempre para lo que necesites.",
  "web.title": "Migite 0.1",
} satisfies Record<TranslationKey, string>;
