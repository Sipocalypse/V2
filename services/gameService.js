
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
      generatedGame = { // Initialize with potentially all rules and existing dares
        title: parsedJson.title,
        rules: parsedJson.rules,
        dares: Array.isArray(parsedJson.dares) ? parsedJson.dares : []
      };
      console.log("Successfully parsed JSON response from webhook. Initial rules count:", generatedGame.rules.length, "Initial dares count:", generatedGame.dares.length);
      
      // If dares are included and rules array is longer than expected, separate them
      if (params.includeDares && generatedGame.rules.length > params.numberOfRules) {
        console.warn(`JSON response had ${generatedGame.rules.length} items in 'rules' array, but expected only ${params.numberOfRules} rules. Assuming extra items are dares.`);
        const actualRules = generatedGame.rules.slice(0, params.numberOfRules);
        const potentialDaresFromRules = generatedGame.rules.slice(params.numberOfRules);
        
        generatedGame.rules = actualRules;
        generatedGame.dares = generatedGame.dares.concat(potentialDaresFromRules); // Add to existing dares
        console.log(`Separated rules and dares from JSON. Now ${generatedGame.rules.length} rules and ${generatedGame.dares.length} dares.`);
      }
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
    const extractedItems = []; // Will hold all rule-like/dare-like items
    let itemsStarted = false; // Renamed from rulesStarted for clarity
    
    const startsWithItemPattern = /^\s*(\d+)\.\s*(.*)/; // General item pattern
    const inlineItemPattern = /^(.*?)\s*(\d+)\.\s*(.*)/s;

    for (const rawLine of lines) {
      const currentLine = rawLine.trim();
      if (currentLine === "") continue;

      if (itemsStarted) {
        const match = currentLine.match(startsWithItemPattern);
        const itemContent = match && typeof match[2] === 'string' ? match[2].trim() : currentLine;
        if (itemContent) extractedItems.push(itemContent);
        continue;
      }

      const startsWithItemMatch = currentLine.match(startsWithItemPattern);
      if (startsWithItemMatch) {
        itemsStarted = true;
        const itemContent = typeof startsWithItemMatch[2] === 'string' ? startsWithItemMatch[2].trim() : '';
        if (itemContent) extractedItems.push(itemContent);
        continue;
      }

      const inlineMatch = currentLine.match(inlineItemPattern);
      if (inlineMatch) {
        itemsStarted = true;
        const titlePart = typeof inlineMatch[1] === 'string' ? inlineMatch[1].trim() : '';
        const itemContent = typeof inlineMatch[3] === 'string' ? inlineMatch[3].trim() : '';

        if (titlePart) titleParts.push(titlePart);
        if (itemContent) extractedItems.push(itemContent);
        continue;
      }

      if (!itemsStarted) {
        titleParts.push(currentLine);
      }
    }

    let gameTitle = titleParts.join(' ').trim();

    if (!gameTitle && extractedItems.length > 0) {
      console.warn("No clear title found in plain text, but items were extracted. Generating default title.");
      gameTitle = `Sipocalypse Game for '${params.activity}'`;
    } else if (gameTitle && params.activity && params.activity.trim().length > 0) {
      const singleActivity = params.activity.trim();
      const doubleActivityPattern = new RegExp(`^${escapeRegExp(singleActivity)}\\s+${escapeRegExp(singleActivity)}$`, 'i');
      if (doubleActivityPattern.test(gameTitle)) {
        console.warn(`Sanitizing title: Detected doubled activity name "${gameTitle}". Reducing to "${singleActivity}".`);
        gameTitle = singleActivity;
      }
    }
    
    if (gameTitle && extractedItems.length > 0) {
      const actualRulesFromText = params.includeDares && extractedItems.length > params.numberOfRules 
                                   ? extractedItems.slice(0, params.numberOfRules)
                                   : extractedItems;
      const daresFromText = params.includeDares && extractedItems.length > params.numberOfRules
                             ? extractedItems.slice(params.numberOfRules)
                             : [];
      
      generatedGame = {
        title: gameTitle,
        rules: actualRulesFromText,
        dares: daresFromText,
      };
      console.log("Constructed game object from plain text. Rules:", actualRulesFromText.length, "Dares:", daresFromText.length);

      if (params.includeDares && daresFromText.length === 0 && extractedItems.length <= params.numberOfRules && extractedItems.length > 0) {
          console.warn("Dares were requested, but plain text parsing did not yield enough items to separate dares from rules based on numberOfRules. All items treated as rules.");
      } else if (params.includeDares && daresFromText.length > 0) {
          console.log(`Successfully separated ${daresFromText.length} dares from plain text based on numberOfRules.`);
      }

    } else {
        console.warn("Webhook response was not valid JSON and did not yield a title and items from plain text parsing.");
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
  
  // Final Dares Sanitization
  if (params.includeDares) {
    if (generatedGame.dares && Array.isArray(generatedGame.dares)) {
      if (generatedGame.dares.length > 0) {
        console.log(`Dares requested and confirmed: ${generatedGame.dares.length} dare(s) are present.`);
      } else {
        console.log("Dares requested, but the 'dares' array is empty after all processing.");
      }
    } else {
      console.warn("Dares requested, but no 'dares' array was populated or it's not an array. Dares list will be empty.");
      generatedGame.dares = []; // Ensure it's an empty array.
    }
  } else { // Dares not requested
    if (generatedGame.dares && generatedGame.dares.length > 0) {
      console.log("Dares NOT requested by the user. Clearing any dares found/parsed: ", generatedGame.dares.length, "dares removed.");
    }
    generatedGame.dares = []; // Explicitly clear if not requested
  }

  return generatedGame;
};
    