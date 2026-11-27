import { v2 as cloudinary } from "cloudinary";

export { cloudinary };

export function configureCloudinary(cloudinaryUrl: string | undefined) {
  if (!cloudinaryUrl) return false;

  try {
    const parsed = new URL(cloudinaryUrl);
    if (
      parsed.protocol !== "cloudinary:" ||
      !parsed.hostname ||
      !parsed.username ||
      !parsed.password
    ) {
      return false;
    }

    cloudinary.config({
      cloud_name: decodeURIComponent(parsed.hostname),
      api_key: decodeURIComponent(parsed.username),
      api_secret: decodeURIComponent(parsed.password),
      secure: true,
    });
    return true;
  } catch {
    return false;
  }
}
