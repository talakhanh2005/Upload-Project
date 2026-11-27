import type { UploadApiResponse } from "cloudinary";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import {
  cloudinary,
  configureCloudinary,
} from "../storage/cloudinary-client.js";

config({ path: ["../../.env", ".env"], quiet: true });

if (!configureCloudinary(process.env.CLOUDINARY_URL)) {
  throw new Error("CLOUDINARY_URL is missing or invalid");
}

const defaultEnvironment =
  process.env.NODE_ENV === "production" ? "production" : "development";
const folderRoot =
  process.env.CLOUDINARY_FOLDER ?? `upload-system/${defaultEnvironment}`;
const isProductionFolder = folderRoot
  .toLowerCase()
  .split("/")
  .includes("production");

if (isProductionFolder) {
  throw new Error(
    "Refusing to run a smoke test in the production Cloudinary folder. Set CLOUDINARY_FOLDER to a dev/preview folder.",
  );
}

const onePixelPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
let uploaded: UploadApiResponse | undefined;

try {
  await cloudinary.api.ping();
  uploaded = await cloudinary.uploader.upload(onePixelPng, {
    resource_type: "image",
    folder: `${folderRoot}/smoke-tests`,
    public_id: `local-${randomUUID()}`,
    unique_filename: false,
    overwrite: false,
    tags: ["smoke-test", "development"],
  });

  const response = await fetch(uploaded.secure_url);
  if (!response.ok || !(await response.arrayBuffer()).byteLength) {
    throw new Error(`Uploaded image could not be read back (${response.status})`);
  }

  console.log(
    JSON.stringify(
      {
        connected: true,
        folder: folderRoot,
        upload: "ok",
        readBack: "ok",
      },
      null,
      2,
    ),
  );
} finally {
  if (uploaded) {
    const result = await cloudinary.uploader.destroy(uploaded.public_id, {
      resource_type: "image",
      invalidate: true,
    });
    console.log(`cleanup=${result.result}`);
  }
}
