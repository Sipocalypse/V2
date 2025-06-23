
// Helper function to escape special characters for use in a regular expression
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

const GAME_GENERATOR_WEBHOOK_URL = 'https://hook.eu2.make.com/8ym052altan60ddmeki1zl2160f1ghxr';

export const generateGameViaWebhook = async (params) => {
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
      // Ignore
    }
    console.error(errorDetails);
    throw new Error(errorDetails);
  }

  const responseText = await response.text();
  let generatedGame = null;

  try {
    const parsedJson = JSON.parse(responseText);
    if (parsedJson && typeof parsedJson.title === 'string' && Array.isArray(parsedJson.rules)) {
      generatedGame = parsedJson;
      console.log("Successfully parsed JSON response from webhook:", generatedGame);
    } else {
      console.warn("Parsed JSON, but it does not match expected GeneratedGame structure:", parsedJson);
    }
  } catch (parseError) {
    console.log("Failed to parse JSON response from webhook. Attempting general plain text parsing. Error:", parseError.message);
    const trimmedResponseText = responseText.trim().toLowerCase();
    if (trimmedResponseText === "accepted") {
      console.error("Webhook returned 'Accepted' instead of game data.");
      throw new Error("The game generator acknowledged the request but didn't return a game. Please check your Make.com scenario configuration or try again.");
    }

    const lines = responseText.split('\n');
    const titleParts = [];
    const extractedRules = [];
    let rulesStarted = false;
    
    const startsWithRulePattern = /^\s*(\d+)\.\s*(.*)/;
    const inlineRulePattern = /^(.*?)\s*(\d+)\.\s*(.*)/s;

    for (const rawLine of lines) {
      const currentLine = rawLine.trim();
      if (currentLine === "") continue;

      if (rulesStarted) {
        const match = currentLine.match(startsWithRulePattern);
        const ruleContent = match && typeof match[2] === 'string' ? match[2].trim() : currentLine;
        if (ruleContent) extractedRules.push(ruleContent);
        continue;
      }

      const startsWithRuleMatch = currentLine.match(startsWithRulePattern);
      if (startsWithRuleMatch) {
        rulesStarted = true;
        const ruleContent = typeof startsWithRuleMatch[2] === 'string' ? startsWithRuleMatch[2].trim() : '';
        if (ruleContent) extractedRules.push(ruleContent);
        continue;
      }

      const inlineMatch = currentLine.match(inlineRulePattern);
      if (inlineMatch) {
        rulesStarted = true;
        const titlePart = typeof inlineMatch[1] === 'string' ? inlineMatch[1].trim() : '';
        const ruleContent = typeof inlineMatch[3] === 'string' ? inlineMatch[3].trim() : '';

        if (titlePart) titleParts.push(titlePart);
        if (ruleContent) extractedRules.push(ruleContent);
        continue;
      }

      if (!rulesStarted) {
        titleParts.push(currentLine);
      }
    }

    let gameTitle = titleParts.join(' ').trim();

    if (!gameTitle && extractedRules.length > 0) {
      console.warn("No clear title found in plain text, but rules were extracted. Generating default title.");
      gameTitle = `Sipocalypse Game for '${params.activity}'`;
    } else if (gameTitle && params.activity && params.activity.trim().length > 0) {
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
        dares: [],
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
  
  if (params.includeDares) {
    if (!Array.isArray(generatedGame.dares)) {
      generatedGame.dares = [];
    }
  } else {
    generatedGame.dares = [];
  }

  return generatedGame;
};
