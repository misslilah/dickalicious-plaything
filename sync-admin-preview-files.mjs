import fs from 'fs';
import path from 'path';

const srcRoot = 'C:/Users/pc/.cursor/projects/empty-window/src';
const dstRoot = 'C:/Users/pc/.cursor/projects/empty-window/dickalicious-plaything/src';
const files = [
  'hooks/useAppStore.tsx',
  'components/AdminRoute.tsx',
  'components/Layout.tsx',
  'pages/Settings.tsx',
  'lib/adminDirectMessages.ts',
  'pages/Dashboard.tsx',
  'pages/CategoryDetail.tsx',
  'pages/TaskFocusPage.tsx',
  'pages/Videos.tsx',
  'pages/MiniGames.tsx',
  'components/PuzzleSessionPlayer.tsx',
  'pages/InteractiveVideoPlay.tsx',
  'pages/InteractiveVideos.tsx',
  'components/InteractiveVideoPlayer.tsx',
  'components/VideoPlaylistSection.tsx',
  'contexts/AudioPlayerProvider.tsx',
  'components/TaskLinkedMediaModal.tsx',
  'pages/VideoPlaylistPlay.tsx',
  'pages/Rewards.tsx',
  'pages/VideoCategoryDetail.tsx',
  'components/TaskCompletionGate.tsx',
  'pages/Training.tsx',
  'pages/Punishments.tsx',
  'components/VideoPlaylistManager.tsx',
  'pages/Profile.tsx',
  'components/CommunityChatBubble.tsx',
];

let synced = 0;
for (const rel of files) {
  const src = path.join(srcRoot, rel);
  const dst = path.join(dstRoot, rel);
  const content = fs.readFileSync(src, 'utf8');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, content, 'utf8');
  synced++;
}
fs.writeFileSync(
  path.join(dstRoot, '..', 'sync-result.txt'),
  `synced=${synced}\n`,
  'utf8',
);
