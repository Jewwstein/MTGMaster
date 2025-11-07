const roomCode = process.argv[2];
if (!roomCode) {
  console.error("Usage: node tmp/patchRoom.mjs <ROOM>");
  process.exit(1);
}

async function main() {
  const res = await fetch(`http://localhost:3000/api/rooms/${encodeURIComponent(roomCode)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "closed" }),
  });
  const text = await res.text();
  console.log("status", res.status);
  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
