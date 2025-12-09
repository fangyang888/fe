import { useState } from "react";

const App2 = () => {
  const [show, setShow] = useState(true);
  return (
    <div>
      <button onClick={() => setShow(!show)}>显示/隐藏</button>
      {show && (
        <img
          src={"https://my-next-git-main-fangyangs-projects.vercel.app/file.svg"}
          width={100}
          height={100}
          alt="1"
        />
      )}
    </div>
  );
};

export default App2;
