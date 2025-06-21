
// import { GoogleGenAI } from "@google/genai"; // Removed
// import { API_MODEL_NAME } from '../constants.js'; // Removed

const GAME_GENERATOR_WEBHOOK_URL = 'https://hook.eu2.make.com/8ym052altan60ddmeki1zl2160f1ghxr';

// Interface GameGenerationParams (from TS) would be conceptually:
// { activity: string, chaosLevel: number, includeDares: boolean, numberOfRules: number }

// Helper function to escape special characters for use in a regular expression
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}


export const generateGameWithGemini = async (params) => { // options renamed to params
  if (!params.activity || params.activity.trim() === "") {
    throw new Error("Activity must be provided to generate a game.");
  }

  let response;
  try {
    console.log("Sending to webhook. Payload:", JSON.stringify(params)); 
    response = await fetch(GAME_GENERATOR_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params), 
    });
  } catch (networkError) {
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
  let generatedGame = null;

  // Attempt to parse as JSON first
  try {
    const parsedJson = JSON.parse(responseText);
    if (parsedJson && typeof parsedJson.title === 'string' && Array.isArray(parsedJson.rules)) {
      generatedGame = parsedJson;
      console.log("Successfully parsed JSON response from webhook:", generatedGame);
    } else {
        console.warn("Parsed JSON, but it does not match expected GeneratedGame structure:", parsedJson);
    }
  } catch (parseError) {
    console.log("Failed to parse JSON response from webhook. Attempting ()-wrapped plain text parsing. Error:", parseError.message);
    const trimmedResponseText = responseText.trim().toLowerCase();
    if (trimmedResponseText === "accepted") {
      console.error("Webhook returned 'Accepted' instead of game data.");
      throw new Error("The game generator acknowledged the request but didn't return a game. Please check your Make.com scenario configuration or try again.");
    }
    
    // New plain text parsing for ()-wrapped content
    const rawLines = responseText.split('\n');
    let extractedTitle = null;
    const extractedRules = [];

    for (const rawLine of rawLines) {
      const currentLine = rawLine.trim();
      if (currentLine.startsWith('(') && currentLine.endsWith(')')) {
        const content = currentLine.substring(1, currentLine.length - 1).trim();
        if (content.length > 0) {
          if (extractedTitle === null) {
            extractedTitle = content;
          } else {
            extractedRules.push(content);
          }
        }
      }
    }

    if (extractedTitle && extractedRules.length > 0) {
      let gameTitle = extractedTitle;

      // Heuristic: If potentialTitle is exactly the activity name repeated twice, reduce it.
      if (params.activity && params.activity.trim().length > 0) {
        const singleActivity = params.activity.trim();
        const doubleActivityPattern = new RegExp(`^${escapeRegExp(singleActivity)}\\s+${escapeRegExp(singleActivity)}$`, 'i');
        if (doubleActivityPattern.test(gameTitle)) {
          console.warn(`Sanitizing title: Detected doubled activity name "${gameTitle}". Reducing to "${singleActivity}".`);
          gameTitle = singleActivity;
        }
      }
      
      generatedGame = {
        title: gameTitle,
        rules: extractedRules,
        dares: [], // Dares are not parsed from this ()-wrapped format
      };
      console.log("Constructed game object from ()-wrapped plain text:", generatedGame);
      
      if (params.includeDares) {
        console.warn("Dares were requested, but the webhook returned ()-wrapped plain text. Dares section will be empty. For dares, the webhook should return structured JSON.");
      }
    } else if (extractedTitle && extractedRules.length === 0) {
        console.warn(`Webhook returned a ()-wrapped title "${extractedTitle}" but no ()-wrapped rules in the expected format. Discarding.`);
    } else if (!extractedTitle && extractedRules.length > 0) {
        console.warn(`Webhook returned ()-wrapped rules but no ()-wrapped title in the expected format. Discarding.`);
    } else {
        console.warn("Webhook response was not valid JSON and did not contain ()-wrapped title and rules.");
    }
  }

  if (!generatedGame) {
    console.error("Could not parse game from webhook response:", responseText.substring(0, 200));
    throw new Error(`The game generator returned an unparsable format. Ensure the webhook returns valid JSON or ()-wrapped text. Response snippet: ${responseText.substring(0, 150)}...`);
  }

  if (!generatedGame.title || !Array.isArray(generatedGame.rules) || generatedGame.rules.length === 0) {
    console.error("Parsed/constructed game is missing essential fields or has no rules:", generatedGame);
    throw new Error("The game generator returned an incomplete game structure. Try adjusting your options or rephrasing the activity.");
  }

  // Ensure dares structure based on request, even if not parsed from ()-wrapped text
  if (params.includeDares) {
    if (!Array.isArray(generatedGame.dares)) { // Could be populated if JSON was successfully parsed
        generatedGame.dares = [];
    }
  } else {
    generatedGame.dares = []; 
  }
  
  return generatedGame;
};
