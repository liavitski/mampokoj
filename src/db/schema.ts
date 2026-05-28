import { serial, text } from "drizzle-orm/pg-core";
import { pgTableCreator } from "drizzle-orm/pg-core";

export const createTable = pgTableCreator(
  (name) => `mampokoj_${name}`
);

export const users = createTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
});
