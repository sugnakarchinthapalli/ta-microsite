import { NextResponse, NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { prompt, data } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required in the request body.' }, { status: 400 });
    }

    const fullPrompt = `${prompt}\n\nHere is the data for analysis:\n${JSON.stringify(data, null, 2)}`;

    let chatHistory = [];
    chatHistory.push({ role: "user", parts: [{ text: fullPrompt }] });

    const geminiApiKey = process.env.GEMINI_API_KEY || "";

    if (!geminiApiKey) {
      console.error('GEMINI_API_KEY is not set in environment variables.');
      return NextResponse.json({ error: 'AI service not configured: Missing Gemini API Key.' }, { status: 500 });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

    // --- NEW: Define the response schema for structured output ---
    // This tells Gemini to return JSON that includes both a summary and chart suggestions.
    const generationConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          summary: {
            type: "STRING",
            description: "A comprehensive executive summary in 3-5 concise bullet points, covering key achievements, challenges, data insights, and recommendations."
          },
          chartSuggestions: {
            type: "ARRAY",
            description: "An array of suggested chart configurations based on the provided data.",
            items: {
              type: "OBJECT",
              properties: {
                type: {
                  type: "STRING",
                  enum: ["BarChart", "PieChart", "LineChart", "AreaChart"], // Limiting types to common Recharts ones
                  description: "The type of chart to suggest (e.g., 'BarChart', 'PieChart')."
                },
                title: {
                  type: "STRING",
                  description: "A descriptive title for the suggested chart."
                },
                dataSourceKey: {
                  type: "STRING",
                  description: "The key from the 'metrics' object in the API response that contains the data for this chart (e.g., 'offerStatusBreakdown', 'sourceOfHireBreakdown')."
                },
                xAxisDataKey: {
                  type: "STRING",
                  description: "For Bar/Line charts, the data key for the X-axis (e.g., 'offerStatus', 'source', 'department', 'month')."
                },
                yAxisDataKey: {
                  type: "STRING",
                  description: "For Bar/Line charts, the data key for the Y-axis (e.g., 'count', 'days'). For Pie charts, this is the value key (e.g., 'count')."
                },
                description: {
                  type: "STRING",
                  description: "A brief explanation of what this chart visualizes and why it's important."
                }
              },
              required: ["type", "title", "dataSourceKey", "yAxisDataKey", "description"]
            }
          }
        },
        required: ["summary", "chartSuggestions"]
      }
    };

    const payload = {
      contents: chatHistory,
      generationConfig: generationConfig, // Include the new generationConfig
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API returned an error response:', response.status, errorData);
      return NextResponse.json({ error: `Gemini API Error (${response.status}): ${errorData.error?.message || 'Unknown error'}` }, { status: response.status });
    }

    const result = await response.json();

    // The AI response is now expected to be structured JSON, parse it as such
    if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
      const aiResponseText = result.candidates[0].content.parts[0].text;
      try {
        const parsedAiResponse = JSON.parse(aiResponseText);
        return NextResponse.json(parsedAiResponse, { status: 200 }); // Return the full structured AI response
      } catch (jsonError) {
        console.error('Failed to parse AI response as JSON:', jsonError, aiResponseText);
        return NextResponse.json({ error: 'AI response was not valid JSON.' }, { status: 500 });
      }
    } else {
      console.error('Unexpected AI response structure:', result);
      return NextResponse.json({ error: 'Failed to get summary from AI due to unexpected response structure.' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Error in AI summary API route:', error);
    return NextResponse.json({ error: 'Internal server error while generating AI summary: ' + (error.message || 'Unknown error') }, { status: 500 });
  }
}
