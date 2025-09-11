import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

/**
 * Prompt the user to enter the authorization code
 */
export async function promptForCode(): Promise<string> {
  const rl = readline.createInterface({ input, output });
  
  try {
    const answer = await rl.question('\nPlease paste the authorization code from your browser: ');
    return answer.trim();
  } finally {
    rl.close();
  }
}