import img01 from "@/assets/advantages/01.jpg";
import img02 from "@/assets/advantages/02.jpg";
import img03 from "@/assets/advantages/03.jpg";
import img04 from "@/assets/advantages/04.jpg";
import img05 from "@/assets/advantages/05.jpg";
import img06 from "@/assets/advantages/06.jpg";
import img07 from "@/assets/advantages/07.jpg";
import img08 from "@/assets/advantages/08.jpg";
import img09 from "@/assets/advantages/09.jpg";
import img10 from "@/assets/advantages/10.jpg";
import img11 from "@/assets/advantages/11.jpg";

export const sutta = {
  id: "AN 11.16",
  title: "The 11 Advantages of Radiation by Mind of Loving-Kindness",
  teacher: "Bhante Dhammavuddho",
  audioUrl: "",
  audioStart: 597.92,
  audioEnd: 767.92,
  canon:
    "Monks, eleven advantages are to be looked for from the radiation by mind of loving-kindness — by making it grow, by making much of it, by making it a vehicle and basis, by persisting in it, by becoming familiar with it, by well establishing it.",
  advantages: [
    { n: 1, title: "Sleeps happy", img: img01 },
    { n: 2, title: "Wakes happy", img: img02 },
    { n: 3, title: "Dreams no evil dream", img: img03 },
    { n: 4, title: "Dear to human beings", img: img04 },
    { n: 5, title: "Dear to non-human beings — guarded by devas", img: img05 },
    { n: 6, title: "Fire, poison or sword do not affect him", img: img06 },
    { n: 7, title: "Concentrates his mind quickly", img: img07 },
    { n: 8, title: "His complexion is serene", img: img08 },
    { n: 9, title: "Dies without bewilderment", img: img09 },
    { n: 10, title: "If penetrated no further", img: img10 },
    { n: 11, title: "Reaches the Brahma world upon dying", img: img11 },
  ],
  commentary:
    "To practice radiation of loving-kindness, the Buddha taught that one should first attain jhāna. With a strong, concentrated mind, the radiation can truly reach other beings. These eleven advantages naturally arise from such well-established practice.",
};

export type Advantage = (typeof sutta.advantages)[number];
