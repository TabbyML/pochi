import { useAutoSaveDisabled } from "@/lib/hooks/use-auto-save";
import { AlertTriangleIcon, PaperclipIcon, TerminalIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";

export function EmptyChatPlaceholder() {
  const autoSaveDisabled = useAutoSaveDisabled();
  const { t } = useTranslation();
  const [placeholder, setPlaceholder] = useState<{
    title: string;
    description: string;
  } | null>(null);

  useEffect(() => {
    setPlaceholder(
      funPlaceholders[Math.floor(Math.random() * funPlaceholders.length)],
    );
  }, []);

  return (
    <div className="flex h-[80vh] select-none flex-col items-center justify-center p-5 text-center text-gray-500 dark:text-gray-300">
      <div className="mb-4">{/* Adjusted icon color for visibility */}</div>
      <h2 className="mb-2 items-center gap-3 font-semibold text-2xl text-gray-700 dark:text-gray-100">
        <TerminalIcon className="mr-1.5 mb-1.5 inline-block animate-[spin_6s_linear_infinite]" />
        {placeholder?.title ?? t("placeholder.title")}
      </h2>
      <p className="mb-4 leading-relaxed">
        {placeholder?.description ?? t("placeholder.subtitle")}
      </p>
      <ul className="m-0 list-none p-0">
        <li className="mb-2 flex items-center">
          <PaperclipIcon className="mr-2 size-4" />{" "}
          {t("placeholder.tips.attachments")}
        </li>
        <li className="mb-2 flex items-center">
          <span className="mr-2 text-base">@</span>{" "}
          {t("placeholder.tips.context")}
        </li>
        <li className="mb-2 flex items-center">
          <span className="mr-3 ml-1 text-base">/</span>{" "}
          {t("placeholder.tips.workflow")}
        </li>
      </ul>
      {!autoSaveDisabled && (
        <div className="mt-6 max-w-md rounded-lg border bg-muted p-4 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <h3 className="items-center font-medium text-sm ">
                <AlertTriangleIcon className="mr-1 mb-[1px] inline size-4" />
                {t("placeholder.autoSave.title")}
              </h3>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">
                {t("placeholder.autoSave.description")}
              </p>
              <div className="mt-3">
                <a
                  href="command:workbench.action.toggleAutoSave"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" variant="default">
                    {t("common.disable")}
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const funPlaceholders = [
  {
    title: "The cursor blinks, a gateway to creation.",
    description: "What marvels will we bring to life today?",
  },
  {
    title: "Ready, Player One?",
    description: "Your coding adventure starts now.",
  },
  {
    title: "Welcome to the digital forge.",
    description: "Let's craft some elegant code together.",
  },
  {
    title: "It's coding o'clock!",
    description: "Time to get this breadboard.",
  },
  {
    title: "Pochi, at your service.",
    description: "Your friendly neighborhood AI assistant.",
  },
  {
    title: "A fresh terminal, a world of possibilities.",
    description: "Let's `git commit` to something great.",
  },
  {
    title: "The silence before the code.",
    description: "Let's fill it with brilliant logic.",
  },
  {
    title: "Ctrl+Shift+Pochi.",
    description: "How can I assist you, master builder?",
  },
  {
    title: "The Matrix has you...",
    description: "...let's write some code to unplug.",
  },
  {
    title: "To code, or not to code?",
    description: "That is not a question. Let's code.",
  },
  {
    title: "Hello, World!",
    description: "What masterpiece shall we craft next?",
  },
  {
    title: "The IDE is your playground.",
    description: "Let's build something fun.",
  },
  {
    title: "Got your thinking cap on?",
    description: "Let's solve some complex problems.",
  },
  {
    title: "The functions are calling...",
    description: "...and I must code.",
  },
  {
    title: "May the source be with you.",
    description: "What are we creating today, young Padawan?",
  },
  {
    title: "Empty canvas, full of potential.",
    description: "Let's sketch out some new features.",
  },
  {
    title: "Engage!",
    description: "Set a course for awesome, warp factor 9.",
  },
  {
    title: "Compiling thoughts...",
    description: "Ready to turn ideas into reality?",
  },
  {
    title: "Your friendly AI companion is here.",
    description: "Let's make some magic happen.",
  },
  {
    title: "The code is strong with this one.",
    description: "I have a good feeling about this.",
  },
  {
    title: "Booting up creativity sequence.",
    description: "Ready for your input.",
  },
  {
    title: "It's dangerous to code alone! Take this.",
    description: "I'm here to help you on your quest.",
  },
  {
    title: "Let's turn coffee into code.",
    description: "What's our first function of the day?",
  },
  {
    title: "The void stares back... with a blinking cursor.",
    description: "Let's give it something to process.",
  },
  {
    title: "Initializing awesomeness...",
    description: "Tell me what you want to build.",
  },
  {
    title: "All systems go.",
    description: "Ready to launch into some new code?",
  },
  {
    title: "The digital frontier awaits.",
    description: "Let's explore it together.",
  },
  {
    title: "I think, therefore I code.",
    description: "What brilliant idea shall we implement?",
  },
  {
    title: "The stage is set, the cursor is ready.",
    description: "Let the coding performance begin.",
  },
  {
    title: "Your friendly neighborhood spider-bot.",
    description: "Here to help you weave some amazing code.",
  },
  {
    title: "I've got a fever, and the only prescription is more code.",
    description: "Let's get to it!",
  },
  {
    title: "The possibilities are endless.",
    description: "Just start typing.",
  },
  {
    title: "Let's make the computer do the work.",
    description: "What shall we automate today?",
  },
  {
    title: "The art of code is a beautiful thing.",
    description: "Let's create something poetic.",
  },
  {
    title: "I'm not just a language model, I'm your partner in code.",
    description: "Let's build something great together.",
  },
  {
    title:
      "The journey of a thousand lines of code begins with a single character.",
    description: "Let's get started.",
  },
  {
    title: "I'm here to help you turn your vision into reality.",
    description: "What's on your mind?",
  },
  {
    title: "The best way to predict the future is to code it.",
    description: "Let's build tomorrow, today.",
  },
  {
    title: "I'm fluent in over 6 million forms of communication...",
    description: "...but my favorite is code. Let's talk.",
  },
  {
    title: "The code is calling, and I must answer.",
    description: "Where shall we begin?",
  },
  {
    title: "Let's write some code that would make our past selves proud.",
    description: "Ready to impress?",
  },
  {
    title: "The keyboard is mightier than the sword.",
    description: "Let's write some powerful code.",
  },
  {
    title: "I'm your trusty sidekick in the world of programming.",
    description: "What's our next adventure?",
  },
  {
    title: "Let's build something that will outlast us.",
    description: "Ready to create a legacy?",
  },
  {
    title: "The code is a puzzle, and we're the master solvers.",
    description: "Let's crack this case.",
  },
  {
    title:
      "I'm here to help you write code that's not just functional, but beautiful.",
    description: "Let's create a work of art.",
  },
  {
    title: "The world is your oyster, and code is the pearl.",
    description: "Let's find some treasures.",
  },
  {
    title: "Let's write some code that's so good, it gives you goosebumps.",
    description: "Ready for the thrill?",
  },
  {
    title: "I'm your co-pilot on this coding journey.",
    description: "Let's fly to new heights.",
  },
  {
    title: "The code is a symphony, and we're the composers.",
    description: "Let's create a masterpiece.",
  },
  {
    title: "I'm here to help you write code that's not just smart, but wise.",
    description: "Let's build something with lasting value.",
  },
  {
    title: "The code is a story, and we're the authors.",
    description: "Let's write a bestseller.",
  },
  {
    title: "I'm your guide in the world of bits and bytes.",
    description: "Let's explore the digital landscape.",
  },
  {
    title: "Let's write some code that's so creative, it surprises even us.",
    description: "Ready to be amazed?",
  },
  {
    title: "The code is a game, and we're the players.",
    description: "Let's win this thing.",
  },
];
