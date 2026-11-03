import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createLocalUser, recoverLocalUser } from "../src/lib/user-management";
import { prisma } from "../src/lib/db";

async function accountInput(command: string, email?: string, name?: string) {
  if (email && (command === "recover" || name)) return { email, name };
  if (!process.stdin.isTTY || process.argv.includes("--password-stdin")) {
    throw new Error('Automation requires EMAIL and, when creating an account, "NAME" arguments.');
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (!email) {
      const value = (await prompt.question("Email: ")).trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254) email = value;
      else console.log("Enter a valid email address.");
    }
    while (command !== "recover" && !name) {
      const value = (await prompt.question("Display name: ")).trim();
      if (value && value.length <= 100) name = value;
      else console.log("Enter a name between 1 and 100 characters.");
    }
    return { email, name };
  } finally { prompt.close(); }
}

async function passwordInput() {
  if (process.argv.includes("--password-stdin")) {
    let value = "";
    for await (const chunk of process.stdin) {
      value += chunk.toString();
      if (value.length > 1024) throw new Error("Password input too long.");
    }
    return value.replace(/\r?\n$/, "");
  }
  if (!process.stdin.isTTY) throw new Error("Use an interactive terminal, or pass --password-stdin for automation.");
  const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const prompt = createInterface({ input: process.stdin, output, terminal: true });
  try {
    process.stdout.write("Password (12–128 characters; hidden): ");
    const password = await prompt.question("");
    process.stdout.write("\nConfirm password: ");
    const confirm = await prompt.question("");
    process.stdout.write("\n");
    if (password !== confirm) throw new Error("Passwords do not match.");
    return password;
  } finally { prompt.close(); }
}

async function main() {
  const [command = "create-owner", emailArgument, nameArgument] = process.argv.slice(2).filter(value => value !== "--password-stdin");
  if (!["create-owner", "create-user", "recover"].includes(command)) {
    throw new Error('Usage: npm run auth:manage -- [create-owner|create-user|recover] [EMAIL] ["NAME"]\nOmit account details to answer prompts. Recovery revokes all sessions and passkeys.');
  }
  const { email, name } = await accountInput(command, emailArgument, nameArgument);
  if (command === "recover") console.log("Recovery replaces the password, removes all passkeys, and signs out every session for this account.");
  const password = await passwordInput();
  if (command === "recover") await recoverLocalUser(email, password);
  else await createLocalUser({ email, name, password }, command === "create-owner");
  console.log(command === "recover" ? "Account recovered. Sign in with the new password and enroll new passkeys." : "Account created. Sign in and add a passkey in Account & access.");
}

void main().catch(error => {
  // Do not print Prisma errors: they may contain submitted values or password hashes.
  console.error(error instanceof Error && (error.name === "ApiError" || !error.name.startsWith("Prisma")) ? error.message : "Account operation failed. Check migrations and whether the email is already registered.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
