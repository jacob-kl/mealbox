// lib/inviteCode.js
export function randomInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
