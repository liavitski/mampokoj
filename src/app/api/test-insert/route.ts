import { db } from "@/server/db";
import { images } from "@/server/db/schema";

export async function GET() {
  try {
    await db.insert(images).values({
      userId: "test-user",
      adId: "937f77ac-4be6-428f-8417-b84ed5f7d84e",
      url: "https://example.com/test.jpg",
    });

    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}