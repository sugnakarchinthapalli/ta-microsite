import { NextResponse, NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // Expecting a 'prompt' string and 'data' object in the request body
    const { prompt, data } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required in the request body.' }, { status: 400 });
    }

    // Construct the full prompt to send to the AI model
    // We stringify the data to ensure it's passed as readable text to the AI
    const fullPrompt = `${prompt}\n\nHere is the data for analysis:\n${JSON.stringify(data, null, 2)}`;

    // Prepare the chat history for the Gemini API call
    let chatHistory = [];
    chatHistory.push({ role: "user", parts: [{ text: fullPrompt }] });

    // Payload for the Gemini API request
    const payload = {
      contents: chatHistory,
      // You can add generationConfig here if you need structured JSON output from the AI
      // For a text summary, it's not strictly necessary.
    };

    // Use the GEMINI_API_KEY environment variable if available (for local development)
    // If running in Canvas, the 'apiKey = ""' will be handled by the runtime
    const geminiApiKey = process.env.GEMINI_API_KEY || "";
    console.log("Gemini api key:", geminiApiKey.substring(0, 5));

    if (!geminiApiKey) {
      console.error('GEMINI_API_KEY is not set in environment variables.');
      return NextResponse.json({ error: 'AI service not configured: Missing Gemini API Key.' }, { status: 500 });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

    // Make the fetch call to the Gemini API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // Check if the API response itself indicates an error (e.g., non-2xx status)
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API returned an error response:', response.status, errorData);
      return NextResponse.json({ error: `Gemini API Error (${response.status}): ${errorData.error?.message || 'Unknown error'}` }, { status: response.status });
    }

    const result = await response.json();

    // Check for a valid response structure from the AI
    if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
      const aiSummary = result.candidates[0].content.parts[0].text;
      return NextResponse.json({ summary: aiSummary }, { status: 200 });
    } else {
      console.error('Unexpected AI response structure:', result);
      return NextResponse.json({ error: 'Failed to get summary from AI due to unexpected response structure.' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Error in AI summary API route:', error);
    return NextResponse.json({ error: 'Internal server error while generating AI summary: ' + (error.message || 'Unknown error') }, { status: 500 });
  }
}
