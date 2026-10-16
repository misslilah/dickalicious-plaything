const GENERIC_STARS = new Set(['✨', '⭐', '★', '☆', '🌟', '*']);

const KEYWORD_EMOJI: [RegExp, string][] = [
  [/paysage|landscape|nature|montagne|plage|foret|forêt/i, '🏞️'],
  [/activit|hobby|sortie/i, '🎯'],
  [/resto.{0,12}20|20\s*€/i, '💶'],
  [/resto.{0,12}50|50\s*€/i, '💵'],
  [/resto.{0,8}chic|gastronom/i, '🥂'],
  [/resto|restaurant|diner|dîner|food/i, '🍽️'],
  [/ville|city|urbain|town/i, '🏙️'],
  [/\bpays\b|country|voyage|travel|world/i, '🌍'],
  [/game|puzzle|play|arcade/i, '🎮'],
  [/shop|store|buy|cosmetic/i, '🛍️'],
  [/trained/i, '💪'],
  [/focus|train|training|workout|task/i, '🎯'],
  [/video|film|watch|cinema/i, '🎬'],
  [/chat|community|social|global|inbox|message/i, '💬'],
  [/punish|malus|discipline/i, '⚡'],
  [/hypno|trance|mindless|mind/i, '🌀'],
  [/makeup|beauty|lipstick/i, '💄'],
  [/cloth|dress|outfit|fashion|maid/i, '👗'],
  [/anal|plug/i, '🍑'],
  [/oral|kiss|mouth/i, '💋'],
  [/chastity|cage|lock/i, '🔒'],
  [/fitness|gym|sport|muscle/i, '💪'],
  [/yoga|stretch|meditat/i, '🧘'],
  [/journal|diar|writ/i, '📝'],
  [/photo|selfie|picture|camer/i, '📷'],
  [/audio|music|listen|sound/i, '🎧'],
  [/exam|quiz|test/i, '📋'],
  [/beginner|intro|start|first/i, '🌱'],
  [/intermediate/i, '🔥'],
  [/sissy|girl|femme/i, '💗'],
  [/heel|shoe/i, '👠'],
  [/hair/i, '💇'],
  [/voice/i, '🎤'],
  [/pet|puppy|kitten/i, '🐾'],
  [/sleep|bed|night/i, '🌙'],
  [/morning|wake/i, '☀️'],
  [/denial|tease/i, '⏳'],
];

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '');
}

export function isGenericCategoryStar(icon: string | null | undefined): boolean {
  return !icon || GENERIC_STARS.has(icon.trim());
}

export function emojiFromCategoryName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '🏷️';
  const folded = fold(trimmed);
  for (const [pattern, emoji] of KEYWORD_EMOJI) {
    if (pattern.test(trimmed) || pattern.test(folded)) return emoji;
  }
  return '🏷️';
}

export function categoryDisplayIcon(
  name: string,
  icon?: string | null,
  fallback = '🏷️',
): string {
  const stored = icon?.trim() ?? '';
  if (stored && !isGenericCategoryStar(stored)) return stored;
  const mapped = emojiFromCategoryName(name);
  return mapped === '🏷️' ? fallback : mapped;
}
