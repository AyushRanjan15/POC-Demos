import { Task } from "@/types";

export const TASKS: Task[] = [
  {
    id: "days_of_week",
    title: "Days of the Week",
    instruction:
      "Can you tell me the days of the week? Please name all seven days, beginning with the very first day of the week and continuing until the last.",
    ttsInstruction:
      "Can you tell me the days of the week? Please name all seven days, beginning with the very first day of the week and continuing until the last. Take your time and speak clearly. When you are ready, press the record button.",
    duration: 20,
    tips: "Name all 7 days from Sunday to Saturday, clearly and at a natural pace.",
  },
  {
    id: "ddk",
    title: "DDK — Syllable Repetition",
    instruction:
      "Please repeat the syllables PA-TA-KA as fast and as clearly as you can for about 5 seconds.",
    ttsInstruction:
      "Please repeat the syllables PA, TA, KA as fast and as clearly as you can for about 5 seconds. When you are ready, press the record button.",
    duration: 10,
    tips: "Say PA-TA-KA, PA-TA-KA, PA-TA-KA… as fast and clearly as you can.",
  },
  {
    id: "picture_description",
    title: "Picture Description",
    instruction:
      "Please look at the picture and describe everything you see in as much detail as possible — the people, what they are doing, and anything else you notice.",
    ttsInstruction:
      "You will see a picture on screen. Please describe everything you see in as much detail as possible — the people, what they are doing, and anything else you notice. Take your time and speak naturally. When you are ready, press the record button.",
    duration: 90,
    tips: "Describe the people, their actions, objects, and the overall setting.",
  },
];
