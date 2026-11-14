/**
 * AI Assistant Page
 *
 * Section 4.1: Complete AI chat interface with sanitization
 * Section 2.2: Streaming support for real-time AI responses
 */

import { useEffect, useRef } from "react";
import { toastT } from "@/lib/toast-i18n";
import { useParams, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, MessageSquarePlus } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DataError } from "@/components/DataError";
import { useToast } from "@/hooks/use-toast";

import {
  useChatSession,
  useCreateChatSession,
  useStreamingChat,
  useDeleteChatSession,
} from "../hooks/useAssistant";
import {
  ChatMessageBubble,
  StreamingText,
} from "../components/ChatMessageBubble";
import { ChatInput } from "../components/ChatInput";

export default function AIAssistantPage() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const [searchParams] = useSearchParams();
  const tripId = searchParams.get("tripId") || undefined;
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Hooks
  const { data: session, isLoading, error } = useChatSession(sessionId);
  const createSession = useCreateChatSession();
  const deleteSession = useDeleteChatSession();
  const { sendStreamingMessage, cancelStream, streamingContent, isStreaming } =
    useStreamingChat({
      sessionId: sessionId || "",
      onError: (error) => {
        toast({
          title: toastT("toast.assistant.errorTitle"),
          description: error.message,
          variant: "destructive",
        });
      },
    });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages, streamingContent]);

  // Create new session
  const handleNewSession = async () => {
    try {
      const newSession = await createSession.mutateAsync(tripId);
      // Navigate to new session
      window.location.href = `/assistant/${newSession.id}${
        tripId ? `?tripId=${tripId}` : ""
      }`;
    } catch {
      toast({
        title: toastT("toast.assistant.errorTitle"),
        description: toastT("toast.assistant.createSessionFailed"),
        variant: "destructive",
      });
    }
  };

  // Delete session
  const handleDeleteSession = async () => {
    if (!sessionId) return;

    try {
      await deleteSession.mutateAsync(sessionId);
      window.location.href = "/assistant";
    } catch {
      toast({
        title: toastT("toast.assistant.errorTitle"),
        description: toastT("toast.assistant.deleteSessionFailed"),
        variant: "destructive",
      });
    }
  };

  // No session selected
  if (!sessionId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <h1 className="text-2xl font-bold">AI Travel Assistant</h1>
          <p className="text-muted-foreground text-center max-w-md">
            Get personalized travel recommendations, itinerary suggestions, and
            answers to all your travel questions.
          </p>
          <Button onClick={handleNewSession} disabled={createSession.isPending}>
            {createSession.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <MessageSquarePlus className="h-4 w-4 mr-2" />
            )}
            Start New Chat
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  // Error state
  if (error) {
    return (
      <DashboardLayout>
        <DataError
          title="Failed to load chat"
          message={error.message}
          onRetry={() => window.location.reload()}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <ErrorBoundary>
        <Card className="flex flex-col h-[calc(100vh-200px)]">
          {/* Header */}
          <CardHeader className="flex-shrink-0 flex flex-row items-center justify-between border-b">
            <CardTitle className="text-lg">AI Assistant</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewSession}
                disabled={createSession.isPending}
              >
                <MessageSquarePlus className="h-4 w-4 mr-1" />
                New Chat
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeleteSession}
                disabled={deleteSession.isPending}
                aria-label="Delete chat session"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          {/* Messages */}
          <CardContent className="flex-1 overflow-y-auto p-0">
            {session?.messages.length === 0 && !streamingContent ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <p className="text-muted-foreground">
                  Start a conversation with the AI assistant.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Ask about destinations, get itinerary suggestions, or plan
                  your perfect trip!
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {session?.messages.map((message) => (
                  <ChatMessageBubble key={message.id} message={message} />
                ))}

                {/* Streaming content */}
                {streamingContent && (
                  <StreamingText content={streamingContent} />
                )}

                {/* Auto-scroll anchor */}
                <div ref={messagesEndRef} />
              </div>
            )}
          </CardContent>

          {/* Input */}
          <ChatInput
            onSend={sendStreamingMessage}
            onCancel={cancelStream}
            isStreaming={isStreaming}
            placeholder={
              tripId
                ? "Ask about this trip..."
                : "Ask me anything about travel..."
            }
          />
        </Card>
      </ErrorBoundary>
    </DashboardLayout>
  );
}
