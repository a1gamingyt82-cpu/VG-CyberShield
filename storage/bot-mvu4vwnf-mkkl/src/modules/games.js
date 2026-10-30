// Games: .tod (truth or dare)
const T = ['Tell your most embarrassing moment 😅', 'Say your crush\'s name or do 10 pushups 💪', 'Show your last Google search 🔍', 'Send a funny voice note to your best friend 🎤'];
const D = ['Type "i am a noob" 3 times in chat 😂', 'Write 5 lines praising an admin 👑', 'Keep a meme as your DP for 1 hour 🤡', 'Join voice and sing a song 🎤'];
async function run(msg, args) {
  const [cmd, sub] = args;
  if (cmd !== 'tod') return null;
  const pick = (sub || '').toLowerCase() === 'dare'
    ? D[Math.floor(Math.random() * D.length)]
    : (sub || '').toLowerCase() === 'truth'
      ? T[Math.floor(Math.random() * T.length)]
      : Math.random() < 0.5 ? T[Math.floor(Math.random() * T.length)] : D[Math.floor(Math.random() * D.length)];
  return msg.reply(`🎮 **TOD** — ${pick}`), true;
}
module.exports = { run };
