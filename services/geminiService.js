
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
    } else {
        console.warn("Parsed JSON, but it does not match expected GeneratedGame structure:", parsedJson);
    }
  } catch (parseError) {
    console.log("Failed to parse JSON response from webhook. Will attempt plain text parsing. Error:", parseError.message);
    const trimmedResponseText = responseText.trim().toLowerCase();
    if (trimmedResponseText === "accepted") {
      console.error("Webhook returned 'Accepted' instead of game data.");
      throw new Error("The game generator acknowledged the request but didn't return a game. Please check your Make.com scenario configuration or try again.");
    }

    // Advanced plain text parsing
    const rawLines = responseText.split('\n');
    const titleParts = [];
    const ruleLines = [];
    let foundFirstRule = false;

    const rulePattern = /^\s*(\d+)\.\s*(.+)/; 
    const inlineRulePattern = /(.*?)(\b\d+\.\s*.+)/; 


    for (const rawLine of rawLines) {
      const currentLine = rawLine.trim();
      if (currentLine.length === 0) continue;

      if (foundFirstRule) {
        const match = currentLine.match(rulePattern);
        if (match && typeof match[2] === 'string') {
          ruleLines.push(match[2].trim());
        } else if (match) {
            console.warn("Rule pattern matched within rules block, but capture group 2 is not a string:", currentLine, match);
        } else {
           console.warn("Non-rule line found within rules block (or malformed rule):", currentLine);
        }
      } else {
        const startsWithRuleMatch = currentLine.match(rulePattern);
        if (startsWithRuleMatch && typeof startsWithRuleMatch[2] === 'string') {
          foundFirstRule = true;
          ruleLines.push(startsWithRuleMatch[2].trim());
        } else if (startsWithRuleMatch) {
            console.warn("startsWithRuleMatch pattern matched, but capture group 2 is not a string:", currentLine, startsWithRuleMatch);
            titleParts.push(currentLine); 
        } else {
          const inlineMatch = currentLine.match(inlineRulePattern);
          if (inlineMatch && typeof inlineMatch[1] === 'string' && typeof inlineMatch[2] === 'string') {
            const titleCandidate = inlineMatch[1].trim();
            const ruleFullText = inlineMatch[2].trim();

            if (titleCandidate.length > 0) {
              titleParts.push(titleCandidate);
            }

            const firstRuleContentMatch = ruleFullText.match(rulePattern);
            if (firstRuleContentMatch && typeof firstRuleContentMatch[2] === 'string') {
              ruleLines.push(firstRuleContentMatch[2].trim());
              foundFirstRule = true;
            } else {
              titleParts.push(currentLine); 
              console.warn("Malformed inline rule content, treating original line as title:", currentLine);
            }
          } else if (inlineMatch) {
              titleParts.push(currentLine);
              console.warn("Inline pattern matched but capture groups are not as expected (e.g. not strings), treating as title:", currentLine, inlineMatch);
          } else {
            titleParts.push(currentLine);
          }
        }
      }
    }

    if (ruleLines.length > 0) {
      let gameTitle;
      let potentialTitle = titleParts.join(' ').trim();

      // Heuristic: If potentialTitle is exactly the activity name repeated twice, reduce it.
      if (params.activity && params.activity.trim().length > 0) {
        const singleActivity = params.activity.trim();
        const doubleActivityPattern = new RegExp(`^${escapeRegExp(singleActivity)}\\s+${escapeRegExp(singleActivity)}$`, 'i');
        if (doubleActivityPattern.test(potentialTitle)) {
          console.warn(`Sanitizing title: Detected doubled activity name "${potentialTitle}". Reducing to "${singleActivity}".`);
          potentialTitle = singleActivity;
        }
      }
      

      if (potentialTitle.length > 0) {
        gameTitle = potentialTitle;
      } else {
        console.warn("Webhook returned plain text rules without a clear title. Generating title based on activity.");
        gameTitle = `Sipocalypse Game for '${params.activity}'`;
        if (gameTitle.length > 70) { 
          gameTitle = `Sipocalypse Game for '${params.activity.substring(0, 30)}...'`;
        }
        if (params.activity.trim() === "") {
          gameTitle = "Generated Sipocalypse Game";
        }
      }
      
      generatedGame = {
        title: gameTitle,
        rules: ruleLines,
        dares: [], 
      };
      console.log("Constructed game object from plain text:", generatedGame);
      
      if (params.includeDares) {
        console.warn("Dares were requested, but the webhook returned a plain text list of rules. Dares section will be empty. For dares, the webhook should return structured JSON.");
      }
    } else if (titleParts.join('').trim().length > 0) {
        console.warn(`Plain text response had a potential title "${titleParts.join(' ')}" but no parsable rules found. Discarding.`);
    }
  }

  if (!generatedGame) {
    console.error("Could not parse game from webhook response:", responseText.substring(0, 200));
    throw new Error(`The game generator returned an unparsable format. Response snippet: ${responseText.substring(0, 150)}...`);
  }

  if (!generatedGame.title || !Array.isArray(generatedGame.rules) || generatedGame.rules.length === 0) {
    console.error("Parsed/constructed game is missing essential fields or has no rules:", generatedGame);
    throw new Error("The game generator returned an incomplete game structure. Try adjusting your options or rephrasing the activity.");
  }

  if (params.includeDares) {
    if (!Array.isArray(generatedGame.dares)) {
      console.warn("Dares were requested, but 'dares' field was not a valid array in the response. Defaulting to empty dares list.");
      generatedGame.dares = [];
    }
  } else {
    generatedGame.dares = []; // Ensure dares is an empty array if not included
  }
  
  return generatedGame;
};
