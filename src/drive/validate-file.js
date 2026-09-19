const data = $json;
const metadata = data.driveMetadata?.body ?? data.driveMetadata ?? {};
if (!metadata.id) throw new Error("DriveFile inexistente o inaccesible");
if (metadata.capabilities?.canDownload !== true)
  throw new Error(`Drive no permite descargar ${data.starterName}`);
if (!/\.zip$/i.test(metadata.name || data.starterName || ""))
  throw new Error("El starter seleccionado no tiene extensión .zip");
const maxBytes = Number($env.MAX_ZIP_SIZE_MB || 25) * 1024 * 1024;
if (Number(metadata.size || 0) > maxBytes)
  throw new Error(`ZIP excede MAX_ZIP_SIZE_MB (${metadata.size} bytes)`);
return [
  {
    json: {
      ...data,
      driveFile: metadata,
      starterName: metadata.name || data.starterName,
    },
  },
];
