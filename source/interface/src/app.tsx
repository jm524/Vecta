import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { engineBridge } from "./bridge/client.js";

// Describes the connection state with the Go engine.
type ConnectionState =
  | { status: "connecting" }
  | { status: "connected"; message: string; version: string }
  | { status: "error"; error: string };

// App is the root visual component that paints our terminal screen.
export const App: React.FC = () => {
  // Keep track of whether we are connected to the Go engine yet.
  const [connection, setConnection] = useState<ConnectionState>({ status: "connecting" });

  useEffect(() => {
    // When the screen opens, send a ping to Go to see if it is talking to us.
    const testBridge = async () => {
      try {
        const response = await engineBridge.ping();
        if (response.success && response.data) {
          setConnection({
            status: "connected",
            message: response.data.message,
            version: response.data.version,
          });
        } else {
          setConnection({
            status: "error",
            error: response.error || "Unknown bridge failure",
          });
        }
      } catch (err: any) {
        setConnection({
          status: "error",
          error: err.message || "Failed to reach Go engine",
        });
      }
    };

    testBridge();
  }, []);

  return (
    // Outer box: Ink requires explicit flexDirection on every container.
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
      {/* Title banner */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">
          Vecta CLI — Local-First Multi-Agent Engine
        </Text>
        <Text dimColor>Sprint Milestone: Day 2 (Bridge Round-Trip)</Text>
      </Box>

      {/* Main greeting */}
      <Box flexDirection="row" marginBottom={1}>
        <Text color="green">Hello World from Ink UI!</Text>
      </Box>

      {/* Status section showing connection to Go */}
      <Box flexDirection="column">
        {connection.status === "connecting" && (
          <Text color="yellow">Connecting to Go systems engine over stdio...</Text>
        )}

        {connection.status === "connected" && (
          <Box flexDirection="column">
            <Text color="green">
              [Bridge Online] Engine says: "{connection.message}" (Engine v{connection.version})
            </Text>
            <Text dimColor>JSON stdio round-trip verified successfully.</Text>
          </Box>
        )}

        {connection.status === "error" && (
          <Text color="red">[Bridge Error] {connection.error}</Text>
        )}
      </Box>
    </Box>
  );
};
