import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Game from "@/pages/Game";

/**
 * App root. AudioArchitect is a single-screen experience, so we skip routing
 * and mount the game directly. QueryClientProvider powers the generated
 * `useGameOver` mutation that hits the Express `/api/game-over` webhook.
 */
const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Game />
    </QueryClientProvider>
  );
}

export default App;
