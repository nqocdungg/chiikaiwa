const friends = new URL('../assets/study-friends.png', import.meta.url).href;

export function Friends() {
  return (
    <img
      className="ck-friends"
      src={friends}
      alt=""
      width="1536"
      height="1024"
      decoding="async"
    />
  );
}
