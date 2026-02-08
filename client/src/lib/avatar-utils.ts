/**
 * Shared utility functions for avatar display
 */

/**
 * Get initials from a name (first letters of first two words)
 */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Generate a consistent gradient color based on username
 */
export function getAvatarGradient(username: string): string {
  const gradients = [
    "bg-gradient-to-br from-rose-400 to-pink-600",
    "bg-gradient-to-br from-pink-400 to-fuchsia-600",
    "bg-gradient-to-br from-fuchsia-400 to-purple-600",
    "bg-gradient-to-br from-purple-400 to-violet-600",
    "bg-gradient-to-br from-violet-400 to-indigo-600",
    "bg-gradient-to-br from-indigo-400 to-blue-600",
    "bg-gradient-to-br from-blue-400 to-cyan-600",
    "bg-gradient-to-br from-cyan-400 to-teal-600",
    "bg-gradient-to-br from-teal-400 to-emerald-600",
    "bg-gradient-to-br from-emerald-400 to-green-600",
    "bg-gradient-to-br from-amber-400 to-orange-600",
    "bg-gradient-to-br from-orange-400 to-red-600",
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}
