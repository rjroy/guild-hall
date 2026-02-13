import { NextResponse } from "next/server";

import { getAgentManager, getEventBus } from "@/lib/server-context";
import { sessionStore } from "@/lib/node-session-store";
import { formatSSE } from "@/lib/sse";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;

  // Verify the session exists
  const session = await sessionStore.getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const eventBus = getEventBus();
  const agentManager = await getAgentManager();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // If no query is running, send current status and close immediately
      if (!agentManager.isQueryRunning(sessionId)) {
        const statusEvent = formatSSE({
          type: "status_change",
          status: session.metadata.status,
        });
        controller.enqueue(encoder.encode(statusEvent));
        controller.close();
        return;
      }

      // Query is running: subscribe to event bus for real-time updates
      const unsubscribe = eventBus.subscribe(sessionId, (event) => {
        const formatted = formatSSE(event);
        controller.enqueue(encoder.encode(formatted));

        // Close stream after done event
        if (event.type === "done") {
          unsubscribe();
          controller.close();
        }
      });

      // Send initial status_change with "running"
      const runningEvent = formatSSE({
        type: "status_change",
        status: "running",
      });
      controller.enqueue(encoder.encode(runningEvent));

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
