import { config } from "dotenv";
import { connect, connection, disconnect, Types } from "mongoose";

config({ path: "../../.env" });
config();

const references: Record<string, string[]> = {
  courses: ["teacherId"],
  assignments: ["courseId", "createdBy"],
  enrollments: ["courseId", "studentId"],
  submissions: ["assignmentId", "studentId"],
  users: ["createdByTeacherId"],
};

async function migrateCollection(name: string, fields: string[]) {
  const collection = connection.collection(name);
  const documents = await collection
    .find({ $or: fields.map((field) => ({ [field]: { $type: "string" } })) })
    .toArray();
  const operations = documents.flatMap((document) => {
    const $set: Record<string, Types.ObjectId> = {};
    for (const field of fields) {
      const value = document[field];
      if (typeof value === "string" && Types.ObjectId.isValid(value)) {
        $set[field] = new Types.ObjectId(value);
      }
    }
    return Object.keys($set).length
      ? [{ updateOne: { filter: { _id: document._id }, update: { $set } } }]
      : [];
  });
  if (operations.length) await collection.bulkWrite(operations);
  return operations.length;
}

async function run() {
  await connect(
    process.env.MONGODB_URI ?? "mongodb://localhost:27017/course_submission",
  );
  let total = 0;
  for (const [collection, fields] of Object.entries(references)) {
    const migrated = await migrateCollection(collection, fields);
    total += migrated;
    console.log(`${collection}: ${migrated} document(s) migrated`);
  }
  console.log(`ObjectId migration complete: ${total} document(s) updated`);
}

void run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnect();
  });
