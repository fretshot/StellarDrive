import { EmptyState } from "@/components/ui/empty-state";

export default function ChatPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Chat</h1>
      <EmptyState
        title="Chat is coming online in M7"
        description="The assistant will answer questions about your connected orgs and propose create-actions with a preview + confirm flow."
      />
      {/* TODO(milestone-7): mount <ChatPanel/> here. */}
    </div>
  );
}
