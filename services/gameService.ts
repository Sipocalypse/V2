
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

  // Attempt to parse as JSON first
  try {
    const parsedJson = JSON.parse(responseText);
    if (parsedJson && typeof parsedJson.title === 'string' && Array.isArray(parsedJson.rules)) {
      generatedGame = parsedJson as GeneratedGame;
      console.log("Successfully parsed JSON response from webhook:", generatedGame);
    } else {
        console.warn("Parsed JSON, but it does not match expected GeneratedGame structure:", parsedJson);
    }
  } catch (parseError: any) {
    console.log("Failed to parse JSON response from webhook. Attempting general plain text parsing. Error:", parseError.message);
    const trimmedResponseText = responseText.trim().toLowerCase();
    if (trimmedResponseText === "accepted") {
      console.error("Webhook returned 'Accepted' instead of game data.");
      throw new Error("The game generator acknowledged the request but didn't return a game. Please check your Make.com scenario configuration or try again.");
    }

    // General plain text parsing logic
    const lines = responseText.split('\n');
    const titleParts: string[] = [];
    const extractedRules: string[] = [];
    let rulesStarted = false;
    
    // Regex for lines starting with a rule number (e.g., "1. ", "01. ", "  2. ")
    const startsWithRulePattern = /^\s*(\d+)\.\s*(.*)/;
    // Regex for rule number appearing later in the line (e.g., "Title part 1. Rule part")
    const inlineRulePattern = /^(.*?)\s*(\d+)\.\s*(.*)/s; // s flag for dotall, though less critical here

    for (const rawLine of lines) {
      const currentLine = rawLine.trim();
      if (currentLine === "") continue;

      if (rulesStarted) {
        // If rules have started, assume subsequent non-empty lines are rules
        // (after stripping potential numbering if it's there)
        const match = currentLine.match(startsWithRulePattern);
        const ruleContent = match && typeof match[2] === 'string' ? match[2].trim() : currentLine;
        if (ruleContent) extractedRules.push(ruleContent);
        continue;
      }

      // Check if the current line starts with a rule number
      const startsWithRuleMatch = currentLine.match(startsWithRulePattern);
      if (startsWithRuleMatch) {
        rulesStarted = true;
        const ruleContent = typeof startsWithRuleMatch[2] === 'string' ? startsWithRuleMatch[2].trim() : '';
        if (ruleContent) extractedRules.push(ruleContent);
        continue;
      }

      // Check if the current line contains a rule number (inline rule)
      const inlineMatch = currentLine.match(inlineRulePattern);
      if (inlineMatch) {
        rulesStarted = true;
        const titlePart = typeof inlineMatch[1] === 'string' ? inlineMatch[1].trim() : '';
        const ruleContent = typeof inlineMatch[3] === 'string' ? inlineMatch[3].trim() : '';

        if (titlePart) titleParts.push(titlePart);
        if (ruleContent) extractedRules.push(ruleContent);
        continue;
      }

      // If none of the above, and rules haven't started, it's a title part
      if (!rulesStarted) {
        titleParts.push(currentLine);
      }
    }

    let gameTitle = titleParts.join(' ').trim();

    if (!gameTitle && extractedRules.length > 0) {
      // If no title was found but rules exist, generate a default title
      console.warn("No clear title found in plain text, but rules were extracted. Generating default title.");
      gameTitle = `Sipocalypse Game for '${params.activity}'`;
    } else if (gameTitle && params.activity && params.activity.trim().length > 0) {
      // Heuristic: If gameTitle is exactly the activity name repeated twice, reduce it.
      const singleActivity = params.activity.trim();
      const doubleActivityPattern = new RegExp(`^${escapeRegExp(singleActivity)}\\s+${escapeRegExp(singleActivity)}$`, 'i');
      if (doubleActivityPattern.test(gameTitle)) {
        console.warn(`Sanitizing title: Detected doubled activity name "${gameTitle}". Reducing to "${singleActivity}".`);
        gameTitle = singleActivity;
      }
    }
    
    if (gameTitle && extractedRules.length > 0) {
      generatedGame = {
        title: gameTitle,
        rules: extractedRules,
        dares: [], // Dares are not parsed from this plain text format
      };
      console.log("Constructed game object from general plain text:", generatedGame);
      
      if (params.includeDares) {
        console.warn("Dares were requested, but the webhook returned plain text. Dares section will be empty. For dares, webhook should return structured JSON.");
      }
    } else {
        console.warn("Webhook response was not valid JSON and did not yield a title and rules from plain text parsing.");
    }
  }

  if (!generatedGame) {
    console.error("Could not parse game from webhook response:", responseText.substring(0, 200));
    throw new Error(`The game generator returned an unparsable format. Ensure webhook returns valid JSON or plain text with title and numbered rules. Response snippet: ${responseText.substring(0, 150)}...`);
  }

  if (!generatedGame.title || !Array.isArray(generatedGame.rules) || generatedGame.rules.length === 0) {
    console.error("Parsed/constructed game is missing essential fields or has no rules:", generatedGame);
    throw new Error("The game generator returned an incomplete game structure. Try adjusting your options or rephrasing the activity.");
  }

  // Ensure dares structure based on request
  if (params.includeDares) {
    if (!Array.isArray(generatedGame.dares)) {
      generatedGame.dares = [];
    }
  } else {
    generatedGame.dares = []; 
  }
  
  return generatedGame;
};
