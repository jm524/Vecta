// Status:: in-progress
// /help — command index and keyboard shortcut cheatsheet (Claude Doc 06).
// Plain 5th-grader explanations: Tells the developer what slash commands and keyboard buttons do.

import React from "react";
import { Box, Text, useInput } from "ink";

export interface HelpCommandProps {
  onClose: () => void;
  terminalSize?: { columns: number; rows: number };
}

export const HelpCommand: React.FC<HelpCommandProps> = ({ onClose, terminalSize }) => {
  const width = terminalSize?.columns || process.stdout.columns || 80;
  const height = terminalSize?.rows || process.stdout.rows || 24;

  useInput((_input, key) => {
    if (key.escape || key.return) {
      onClose();
    }
  });

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      padding={1}
      borderStyle="round"
      borderColor="cyan"
    >
      <Text bold color="cyan">
        Vecta Quick Help &amp; Keyboard Cheatsheet
      </Text>
      <Text color="gray">All available commands, modes, and keyboard navigation keys.</Text>

      <Box marginTop={1} flexDirection="column">
        <Text bold color="white">
          Slash Commands:
        </Text>
        <Box marginLeft={2} flexDirection="column">
          <Text color="cyan">/roles (or /agent roles) <Text color="gray">- Open interactive worker roles manager</Text></Text>
          <Text color="cyan">/server stop             <Text color="gray">- Stop running local AI servers (Ollama, LM Studio)</Text></Text>
          <Text color="cyan">/help                    <Text color="gray">- Show this command and keyboard shortcut guide</Text></Text>
          <Text color="cyan">/exit, /quit             <Text color="gray">- Exit Vecta cleanly</Text></Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold color="white">
          Global Shortcuts:
        </Text>
        <Box marginLeft={2} flexDirection="column">
          <Text color="yellow">Tab            <Text color="gray">- Switch between PLANNING mode and BUILD mode</Text></Text>
          <Text color="yellow">Ctrl + Left    <Text color="gray">- Hide right-hand live inspector sidebar</Text></Text>
          <Text color="yellow">Ctrl + Right   <Text color="gray">- Show right-hand live inspector sidebar</Text></Text>
          <Text color="yellow">Shift + Tab    <Text color="gray">- Toggle "Auto-accept edits" mode on/off</Text></Text>
          <Text color="yellow">PageUp / Down  <Text color="gray">- Scroll conversation history up and down</Text></Text>
          <Text color="yellow">/              <Text color="gray">- Open slash command autocomplete dropdown</Text></Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold color="white">
          Inside /roles:
        </Text>
        <Box marginLeft={2} flexDirection="column">
          <Text color="green">Up / Down      <Text color="gray">- Navigate through roles and menu actions</Text></Text>
          <Text color="green">Space          <Text color="gray">- Toggle worker role on or off</Text></Text>
          <Text color="green">Enter          <Text color="gray">- Drill down into actions or confirm selection</Text></Text>
          <Text color="green">Esc            <Text color="gray">- Go back one level or close screen</Text></Text>
        </Box>
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">Press Esc or Enter to close this help window</Text>
      </Box>
    </Box>
  );
};
