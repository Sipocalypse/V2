
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

const DARE_SEPARATOR_KEYWORD = "###";

// Cleans an array of potential strings: trims, filters out non-strings and empty strings.
const cleanStringArrayBasic = (arr: any[]): string[] => {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((item: any) => typeof item === 'string')
    .map((s: string) => s.trim())
    .filter((s: string) => s !== '');
};

// Cleans rule/dare lines: removes leading numbering (e.g., "1. "), trims, and filters empty.
const cleanAndDeduplicatePotentialRules = (lines: string[]): string[] => {
  if (!Array.isArray(lines)) return [];
  return lines.map(line => line.replace(/^\s*\d+\.\s*/, '').trim()).filter(rule => rule !== "");
};

// Helper function to parse items using two separators (primarily for JSON arrays where "###" is an item)
function parseItemsWithTwoSeparators(items: string[], separator: string): { title: string | undefined, rulesBlock: string[], daresBlock: string[] } {
    let titleStr: string | undefined;
    let rulesContent: string[] = []; 
    let daresContent: string[] = []; 

    const stringItems = items.map(item => String(item).trim()).filter(s => s !== '');

    console.log(`HELPER: Initial stringItems for parseItemsWithTwoSeparators (trimmed, non-empty):`, JSON.stringify(stringItems));

    if (stringItems.length === 0) {
        console.log(`HELPER: Input items array is empty after trimming.`);
        return { title: undefined, rulesBlock: [], daresBlock: [] };
    }
    
    // This branch is for when the input 'items' is a single string that itself contains separators.
    // This is less common for this helper now, as plain text uses direct split.
    // However, it could be relevant if a JSON array contains a single long string with separators.
    if (stringItems.length === 1 && stringItems[0].includes(separator)) {
        const singleItemContent = stringItems[0];
        console.log(`HELPER: Single item found containing separator(s): "${singleItemContent}"`);
        const parts = singleItemContent.split(separator);
        
        titleStr = parts[0]?.trim();
        if (titleStr === "") titleStr = undefined; 

        if (parts.length > 1) { 
            const rulesPart = parts[1]?.trim();
            if (rulesPart) rulesContent = [rulesPart]; 
        }
        if (parts.length > 2) { 
            const daresPart = parts[2]?.trim();
            if (daresPart) daresContent = [daresPart]; 
        }
        console.log(`HELPER (Single-item split): Title: "${titleStr}", Rules Block: [${rulesContent.join('; ')}], Dares Block: [${daresContent.join('; ')}]`);
    } else { // This branch is for when 'items' is an array of multiple strings, and "###" is one of those strings.
        const firstSepIdx = stringItems.findIndex(item => item === separator);
        if (firstSepIdx !== -1) {
            titleStr = stringItems.slice(0, firstSepIdx).join(' ').trim(); 
            if (titleStr === "") titleStr = undefined;

            const itemsAfterFirst = stringItems.slice(firstSepIdx + 1);
            const secondSepIdx = itemsAfterFirst.findIndex(item => item === separator);

            if (secondSepIdx !== -1) {
                rulesContent = itemsAfterFirst.slice(0, secondSepIdx); 
                daresContent = itemsAfterFirst.slice(secondSepIdx + 1); 
            } else {
                rulesContent = itemsAfterFirst; 
            }
        } else { // No separator found in multi-item array
            if (stringItems.length > 0) {
                titleStr = stringItems[0]; 
                rulesContent = stringItems.slice(1); 
            }
        }
        console.log(`HELPER (Multi-item logic): Title: "${titleStr}", Rules Block Items: ${rulesContent.length}, Dares Block Items: ${daresContent.length}`);
    }
    
    if (titleStr === separator) titleStr = undefined;

    return {
        title: titleStr || undefined,
        rulesBlock: cleanStringArrayBasic(rulesContent), 
        daresBlock: cleanStringArrayBasic(daresContent)  
    };
}


export const generateGameViaWebhook = async (params: GameGenerationParams): Promise<GeneratedGame> => {
  if (!params.activity || params.activity.trim() === "") {
    throw new Error("Activity must be provided to generate a game.");
  }

  try {
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
      throw new Error(`Failed to connect to the game generator: ${networkError.message || String(networkError)}. Please check your internet connection.`);
    }

    if (!response.ok) {
      let errorDetails = `Webhook request failed with status: ${response.status}`;
      try {
        const errorText = await response.text();
        if (errorText) {
          errorDetails += ` - ${errorText}`;
        }
      } catch (e) { /* Ignore */ }
      console.error(errorDetails);
      throw new Error(errorDetails);
    }

    const responseText = await response.text();
    console.log("Webhook Raw Response Text:", responseText);

    let titleStr: string | undefined;
    let rawRulesBlockStrings: string[] = []; // Used for blocks that might contain newlines
    let rawDaresBlockStrings: string[] = [];

    let parsedIdeallyFromJson = false;

    try {
      const parsedJson = JSON.parse(responseText);
      console.log("PARSING: Attempting JSON parse. Parsed object:", parsedJson);

      if (parsedJson.title && typeof parsedJson.title === 'string' &&
          Array.isArray(parsedJson.rules)
      ) {
          titleStr = parsedJson.title.trim();
          // These are expected to be arrays of individual rule/dare strings
          rawRulesBlockStrings = parsedJson.rules.map((item: any) => String(item).trim()).filter(Boolean); 
          rawDaresBlockStrings = Array.isArray(parsedJson.dares) ? parsedJson.dares.map((item: any) => String(item).trim()).filter(Boolean) : [];
          parsedIdeallyFromJson = true;
          console.log("PARSING: Ideal JSON structure {title, rules, ?dares} direct parse.");
      } else {
          let itemsForSeparatorParsing: string[] = [];
          let potentialJsonTitle: string | undefined = undefined;

          if (parsedJson.title && typeof parsedJson.title === 'string') {
              potentialJsonTitle = parsedJson.title.trim();
          }

          if (Array.isArray(parsedJson)) {
              itemsForSeparatorParsing = parsedJson.map(item => String(item));
          } else if (parsedJson.content && Array.isArray(parsedJson.content)) { 
              itemsForSeparatorParsing = parsedJson.content.map(item => String(item));
          } else if (parsedJson.rules && Array.isArray(parsedJson.rules) && !parsedJson.title) {
               // If only rules array is present, might contain title and separators
              itemsForSeparatorParsing = parsedJson.rules.map(item => String(item));
          }


          if (itemsForSeparatorParsing.length > 0) {
              console.log("PARSING: JSON with array-like content, passing to parseItemsWithTwoSeparators. Items:", JSON.stringify(itemsForSeparatorParsing));
              const { title: sepParsedTitle, rulesBlock: sepParsedRules, daresBlock: sepParsedDares } = parseItemsWithTwoSeparators(itemsForSeparatorParsing, DARE_SEPARATOR_KEYWORD);
              titleStr = potentialJsonTitle || sepParsedTitle;
              rawRulesBlockStrings = sepParsedRules; // output of parseItemsWithTwoSeparators is already cleaned and items are distinct
              rawDaresBlockStrings = sepParsedDares;
          } else if (potentialJsonTitle) { 
              titleStr = potentialJsonTitle;
              // rawRulesBlockStrings and rawDaresBlockStrings remain empty arrays
              console.log("PARSING: JSON with title, but no parsable rule/dare array. Rules/dares default to empty.");
          } else {
              console.log("PARSING: Unrecognized JSON structure, will fall to plain text mode after this catch block.");
              throw new Error("Force plain text parsing for non-standard JSON."); 
          }
      }
    } catch (e: any) {
        if (!parsedIdeallyFromJson) { 
          console.log("PARSING: Plain text mode activated. Raw Response Text has been logged above.");
          const textParts = responseText.split(DARE_SEPARATOR_KEYWORD);
          console.log(`PARSING (Plain Text Direct Split by "###"): Found ${textParts.length} parts.`);

          if (textParts.length === 1 && textParts[0].trim().toLowerCase() === "accepted") {
              console.error("Webhook returned 'Accepted' instead of game data (plain text path).");
              throw new Error("The game generator acknowledged the request but didn't return a game. Please check your Make.com scenario configuration or try again.");
          }

          if (textParts.length > 0) {
              titleStr = textParts[0].trim();
              console.log(`PARSING (Plain Text Direct Split): Tentative Title: "${titleStr}"`);
          }
          if (textParts.length > 1 && textParts[1].trim() !== "") {
              rawRulesBlockStrings = [textParts[1]]; // Keep as a single block string for flatMap
              console.log(`PARSING (Plain Text Direct Split): Tentative Raw Rules Block String:`, JSON.stringify(rawRulesBlockStrings));
          }
          if (textParts.length > 2 && textParts[2].trim() !== "") {
              rawDaresBlockStrings = [textParts[2]]; // Keep as a single block string for flatMap
              console.log(`PARSING (Plain Text Direct Split): Tentative Raw Dares Block String:`, JSON.stringify(rawDaresBlockStrings));
          }
          
          // If no separators found, and not "accepted", titleStr is the whole text. Rules/dares are empty.
          // The expansion logic below will handle splitting these blocks by newline.
      } else {
          // Error occurred after ideal JSON parsing (e.g., in map/filter), highly unlikely here
          const errorMessage = (e instanceof Error) ? e.message : String(e);
          console.error("Error during or after ideal JSON parsing attempt (unexpected):", errorMessage);
      }
    }

    console.log(`PRE-EXPANSION: Title: "${titleStr}"`);
    console.log(`PRE-EXPANSION: Raw Rules Block Strings (${rawRulesBlockStrings.length}):`, JSON.stringify(rawRulesBlockStrings));
    console.log(`PRE-EXPANSION: Raw Dares Block Strings (${rawDaresBlockStrings.length}):`, JSON.stringify(rawDaresBlockStrings));

    // Expand blocks by newline. If already individual strings (e.g. from ideal JSON), split('\n') on "Rule1" makes ["Rule1"]
    const expandedRules = rawRulesBlockStrings.flatMap(block => block.split('\n'));
    const expandedDares = rawDaresBlockStrings.flatMap(block => block.split('\n'));

    console.log(`POST-EXPANSION: Expanded Rules (${expandedRules.length}):`, JSON.stringify(expandedRules.slice(0,10)));
    console.log(`POST-EXPANSION: Expanded Dares (${expandedDares.length}):`, JSON.stringify(expandedDares.slice(0,10)));

    if (!titleStr || titleStr.trim() === "") {
      titleStr = `Sipocalypse Game for '${params.activity}'`;
      console.warn("No title found after parsing, using default.");
    } else {
      const singleActivity = params.activity.trim();
      if (singleActivity){ 
          const doubleActivityPattern = new RegExp(`^${escapeRegExp(singleActivity)}\\s+${escapeRegExp(singleActivity)}$`, 'i');
          if (doubleActivityPattern.test(titleStr)) {
            console.warn(`Sanitizing title: Detected doubled activity name "${titleStr}". Reducing to "${singleActivity}".`);
            titleStr = singleActivity;
          }
      }
    }

    const finalRulesArr = cleanAndDeduplicatePotentialRules(expandedRules);
    const finalDaresArr = cleanAndDeduplicatePotentialRules(expandedDares);

    console.log(`POST-CLEANING: Title: "${titleStr}"`);
    console.log(`POST-CLEANING: Final Rules (${finalRulesArr.length}):`, JSON.stringify(finalRulesArr.slice(0,10)));
    console.log(`POST-CLEANING: Final Dares (${finalDaresArr.length}):`, JSON.stringify(finalDaresArr.slice(0,10)));
    console.log(`POST-CLEANING: Params: numberOfRules=${params.numberOfRules}, includeDares=${params.includeDares}`);

    const finalGame: GeneratedGame = {
      title: titleStr,
      rules: finalRulesArr.slice(0, params.numberOfRules), 
      dares: []
    };

    if (params.includeDares) {
      if (finalDaresArr.length > 0) {
        finalGame.dares = finalDaresArr;
        console.log(`PROCESSING: Using explicitly parsed and cleaned dares. Count: ${finalDaresArr.length}`);
      } else if (finalRulesArr.length > params.numberOfRules) {
        // Only use rules overflow if no explicit dares were found AND includeDares is true
        finalGame.dares = finalRulesArr.slice(params.numberOfRules);
        console.log(`PROCESSING: No explicit dares. Using rules overflow as dares. Count: ${finalGame.dares.length}`);
      } else {
        console.log(`PROCESSING: IncludeDares is true, but no explicit dares found and no rules overflow.`);
      }
    }
    
     if (finalGame.rules.length === 0 && (!finalGame.dares || finalGame.dares.length === 0)) {
       console.warn("No rules or dares were successfully parsed or generated. The game will be empty except for the title.");
     }
    
    console.log("FINAL GAME OBJECT:", JSON.stringify(finalGame));
    return finalGame;

  } catch (error: any) {
    const errorMessage = error?.message || (typeof error === 'string' ? error : "An unknown error occurred within the game generation service.");
    console.error("SERVICE CRITICAL ERROR in generateGameViaWebhook:", errorMessage, error);
    throw new Error(`Game Service Error: ${errorMessage}`);
  }
};
