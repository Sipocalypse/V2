
import { GeneratedGame } from '../types';

const GAME_GENERATOR_WEBHOOK_URL = 'https://hook.eu2.make.com/8ym052altan60ddmeki1zl2160f1ghxr';

interface GameGenerationParams {
  activity: string;
  chaosLevel: number; // Expect number here
  includeDares: boolean;
  numberOfRules: number;
}

// Helper function to escape special characters for use in a regular expression
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

const DARE_SEPARATOR_KEYWORD = "dares"; // Case-insensitive check will be used

export const generateGameViaWebhook = async (params: GameGenerationParams): Promise<GeneratedGame> => {
  if (!params.activity || params.activity.trim() === "") {
    throw new Error("Activity must be provided to generate a game.");
  }

  let response: Response;
  try {
    console.log("Sending to webhook. Payload:", JSON.stringify(params));
    response = await fetch(GAME_GENERATOR_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
  } catch (networkError: any) {
    console.error("Network error calling webhook:", networkError);
    throw new Error(`Failed to connect to the game generator: ${networkError.message}. Please check your internet connection.`);
  }

  if (!response.ok) {
    let errorDetails = `Webhook request failed with status: ${response.status}`;
    try {
      const errorText = await response.text();
      if (errorText) {
        errorDetails += ` - ${errorText}`;
      }
    } catch (e) {
      // Ignore error from parsing response text if response is not ok
    }
    console.error(errorDetails);
    throw new Error(errorDetails);
  }

  const responseText = await response.text();
  let generatedGame: GeneratedGame | null = null;
  let rawRules: string[] = [];
  let rawDares: string[] = [];
  let titleFromResponse: string | undefined;

  // Attempt to parse as JSON first
  try {
    const parsedJson = JSON.parse(responseText);
    titleFromResponse = parsedJson.title;

    if (parsedJson && typeof parsedJson.title === 'string') {
      if (Array.isArray(parsedJson.rules) && Array.isArray(parsedJson.dares)) {
        // Ideal case: distinct rules and dares arrays
        rawRules = parsedJson.rules.filter((rule: any) => typeof rule === 'string');
        rawDares = parsedJson.dares.filter((dare: any) => typeof dare === 'string');
        console.log("JSON PARSING: Found distinct 'rules' and 'dares' arrays.");
      } else if (Array.isArray(parsedJson.rules)) {
        // Case: Only a 'rules' array, check for "Dares" separator within it
        console.log("JSON PARSING: Found 'rules' array, checking for 'Dares' separator keyword.");
        const separatorIndex = parsedJson.rules.findIndex((item: any) => 
          typeof item === 'string' && item.toLowerCase().trim() === DARE_SEPARATOR_KEYWORD
        );

        if (separatorIndex !== -1) {
          rawRules = parsedJson.rules.slice(0, separatorIndex).filter((rule: any) => typeof rule === 'string');
          rawDares = parsedJson.rules.slice(separatorIndex + 1).filter((dare: any) => typeof dare === 'string');
          console.log(`JSON PARSING: 'Dares' keyword found at index ${separatorIndex}. Split into ${rawRules.length} rules and ${rawDares.length} dares.`);
        } else {
          // No separator, all items in 'rules' are potential rules/dares mixed
          rawRules = parsedJson.rules.filter((rule: any) => typeof rule === 'string');
          console.log("JSON PARSING: No 'Dares' keyword in 'rules' array. All items treated as potential rules/mixed content.");
        }
      } else {
        console.warn("Parsed JSON, but 'rules' is not an array or structure is unexpected:", parsedJson);
      }
    } else {
      console.warn("Parsed JSON, but it does not match expected GeneratedGame structure (missing title):", parsedJson);
    }
  } catch (parseError: any) {
    console.log("Failed to parse JSON response from webhook. Attempting plain text parsing. Error:", parseError.message);
    const trimmedResponseText = responseText.trim().toLowerCase();
    if (trimmedResponseText === "accepted") {
      console.error("Webhook returned 'Accepted' instead of game data.");
      throw new Error("The game generator acknowledged the request but didn't return a game. Please check your Make.com scenario configuration or try again.");
    }

    // Plain text parsing logic
    const lines = responseText.split('\n').map(line => line.trim()).filter(line => line !== "");
    const titleParts: string[] = [];
    let itemsStartedBasedOnNumbering = false;
    const separatorIndex = lines.findIndex(line => line.toLowerCase() === DARE_SEPARATOR_KEYWORD);

    const potentialItems: string[] = [];

    if (separatorIndex !== -1) {
        console.log(`PLAIN TEXT: "Dares" keyword found at line index ${separatorIndex}.`);
        // Everything before separator is title or rule
        for(let i=0; i < separatorIndex; i++) {
            const line = lines[i];
            // Simplistic title detection: if it doesn't look like a numbered item, assume it's part of the title
            if (!/^\s*\d+\.\s*/.test(line) && rawRules.length === 0) { // only add to title if rules haven't started
                titleParts.push(line);
            } else {
                rawRules.push(line.replace(/^\s*\d+\.\s*/, '').trim()); // Add to rawRules, remove numbering
            }
        }
        rawDares = lines.slice(separatorIndex + 1).map(line => line.replace(/^\s*\d+\.\s*/, '').trim()).filter(dare => dare !== ""); // Remove numbering from dares
    } else {
        console.log("PLAIN TEXT: No 'Dares' keyword found. Treating lines based on numbering or as mixed content.");
        // No separator, try to distinguish title from items (rules/dares mixed)
        for (const line of lines) {
            if (!itemsStartedBasedOnNumbering && !/^\s*\d+\.\s*/.test(line)) {
                titleParts.push(line);
            } else {
                itemsStartedBasedOnNumbering = true;
                potentialItems.push(line.replace(/^\s*\d+\.\s*/, '').trim()); // Add to potentialItems, remove numbering
            }
        }
        rawRules = potentialItems; // All potential items are initially considered rules if no separator
    }
    
    titleFromResponse = titleParts.join(' ').trim();
  }

  // Ensure title
  if (!titleFromResponse) {
    console.warn("No title found. Generating default title.");
    titleFromResponse = `Sipocalypse Game for '${params.activity}'`;
  } else if (params.activity && params.activity.trim().length > 0) {
    // Title sanitization (example: remove duplicated activity name)
    const singleActivity = params.activity.trim();
    const doubleActivityPattern = new RegExp(`^${escapeRegExp(singleActivity)}\\s+${escapeRegExp(singleActivity)}$`, 'i');
    if (doubleActivityPattern.test(titleFromResponse)) {
      console.warn(`Sanitizing title: Detected doubled activity name "${titleFromResponse}". Reducing to "${singleActivity}".`);
      titleFromResponse = singleActivity;
    }
  }

  // Construct final game object
  generatedGame = {
    title: titleFromResponse,
    rules: [],
    dares: []
  };

  console.log(`PRE-PROCESSING: Raw Rules (${rawRules.length}):`, JSON.stringify(rawRules.slice(0,5)));
  console.log(`PRE-PROCESSING: Raw Dares (${rawDares.length}):`, JSON.stringify(rawDares.slice(0,5)));
  console.log(`PRE-PROCESSING: Params: numberOfRules=${params.numberOfRules}, includeDares=${params.includeDares}`);

  // Populate rules, capped by numberOfRules
  generatedGame.rules = rawRules.slice(0, params.numberOfRules);

  // Populate dares if requested
  if (params.includeDares) {
    // If rawDares is already populated (e.g. from "Dares" keyword or explicit JSON array), use it.
    // Otherwise, if rawRules had more items than numberOfRules, those become dares.
    if (rawDares.length > 0) {
        generatedGame.dares = rawDares;
        console.log(`PROCESSING: Using explicitly separated/provided rawDares. Count: ${generatedGame.dares.length}`);
    } else if (rawRules.length > params.numberOfRules) {
        generatedGame.dares = rawRules.slice(params.numberOfRules);
        console.log(`PROCESSING: No explicit dares, taking dares from rules overflow. Count: ${generatedGame.dares.length}`);
    } else {
        generatedGame.dares = []; // No explicit dares and no overflow from rules
        console.log(`PROCESSING: No explicit dares and no rules overflow. Dares empty.`);
    }
  } else {
    generatedGame.dares = []; // Dares not requested
    console.log("PROCESSING: Dares not requested. Dares set to empty.");
  }
  
  // Final validation
  if (!generatedGame.title || !Array.isArray(generatedGame.rules) || generatedGame.rules.length === 0) {
    console.error("Constructed game is missing essential fields or has no rules:", generatedGame);
    console.error("Original responseText snippet:", responseText.substring(0,300));
    throw new Error("The game generator returned an incomplete or unparsable game structure. Try adjusting your options or rephrasing the activity.");
  }
  
  console.log("FINAL GAME OBJECT:", JSON.stringify(generatedGame));
  return generatedGame;
};
