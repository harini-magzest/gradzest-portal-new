import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Search,
  MapPin,
  Star,
  BookOpen,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Globe,
  UserPlus,
  MessageCircle,
  Zap,
  Rocket,
  Mail,
  LayoutGrid,
  Monitor,
  Briefcase,
  Cog,
  Brain,
  Stethoscope,
  Activity,
  X,
  CheckCircle,
  DollarSign,
  Clock,
  Calendar,
  GraduationCap,
} from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useAuthModal } from "../context/AuthModalContext";
import { BRAND, DESTINATIONS, HERO_TAGLINE, HIGHLIGHTS } from "../data/siteFacts";

const FLAGS: Record<string, string> = {
  Canada: "🇨🇦",
  Australia: "🇦🇺",
  "United Kingdom": "🇬🇧",
  Germany: "🇩🇪",
  Singapore: "🇸🇬",
  Netherlands: "🇳🇱",
  "United States": "🇺🇸",
  "New Zealand": "🇳🇿",
};

const FLAG_CODES: Record<string, string> = {
  "United States": "us",
  "United Kingdom": "gb",
  Canada: "ca",
  Australia: "au",
  Germany: "de",
  Singapore: "sg",
  Netherlands: "nl",
  "New Zealand": "nz",
  Ireland: "ie",
  France: "fr",
  Sweden: "se",
  Switzerland: "ch",
  Japan: "jp",
  "South Korea": "kr",
  Austria: "at",
  Denmark: "dk",
};

// Logos are served through our own favicon proxy (cached server-side), never hot-linked
const G = (d: string) => `/api/favicon/${d}`;

interface MarqueeUni {
  name: string;
  logo: string;
  country: string;
  city: string;
  ranking: number;
  website: string;
  description: string;
  acceptanceRate: number;
  rating: number;
  type: string;
}

const MARQUEE_UNIS: MarqueeUni[] = [
  {
    name: "University of Toronto",
    logo: G("utoronto.ca"),
    country: "Canada",
    city: "Toronto",
    ranking: 21,
    website: "utoronto.ca",
    description:
      "Canada's leading research university, ranked among the world's top 25. Renowned for innovation, diverse programs, and strong industry connections across sciences, engineering, business, and the arts.",
    acceptanceRate: 43,
    rating: 4.8,
    type: "Public Research University",
  },
  {
    name: "TU Munich",
    logo: G("tum.de"),
    country: "Germany",
    city: "Munich",
    ranking: 37,
    website: "tum.de",
    description:
      "Germany's top technical university, offering tuition-free education and world-class research. Famous for engineering, computer science, and natural sciences.",
    acceptanceRate: 8,
    rating: 4.8,
    type: "Public Technical University",
  },
  {
    name: "National University of Singapore",
    logo: G("nus.edu.sg"),
    country: "Singapore",
    city: "Singapore",
    ranking: 8,
    website: "nus.edu.sg",
    description:
      "Asia's top-ranked university, offering a global approach to education and research with a strong focus on entrepreneurship and interdisciplinary studies.",
    acceptanceRate: 16,
    rating: 4.9,
    type: "Public Research University",
  },
  {
    name: "Monash University",
    logo: G("monash.edu"),
    country: "Australia",
    city: "Melbourne",
    ranking: 58,
    website: "monash.edu",
    description:
      "A leading Australian research university known for innovation, sustainability, and global partnerships across medicine, engineering, arts, and business.",
    acceptanceRate: 70,
    rating: 4.7,
    type: "Public Research University",
  },
  {
    name: "Harvard University",
    logo: G("harvard.edu"),
    country: "United States",
    city: "Cambridge, MA",
    ranking: 4,
    website: "harvard.edu",
    description:
      "The world's most prestigious university with an endowment exceeding $50 billion. Home to 161 Nobel laureates and leaders in law, medicine, business, and the arts.",
    acceptanceRate: 4,
    rating: 4.9,
    type: "Private Ivy League University",
  },
  {
    name: "King's College London",
    logo: G("kcl.ac.uk"),
    country: "United Kingdom",
    city: "London",
    ranking: 40,
    website: "kcl.ac.uk",
    description:
      "A leading research university in the heart of London, renowned for health sciences, law, social science, humanities, and the arts.",
    acceptanceRate: 17,
    rating: 4.7,
    type: "Public Research University",
  },
  {
    name: "McGill University",
    logo: G("mcgill.ca"),
    country: "Canada",
    city: "Montreal",
    ranking: 46,
    website: "mcgill.ca",
    description:
      "Canada's top-ranked university, celebrated for research excellence, a diverse student body, and alumni including Nobel Prize winners and world leaders.",
    acceptanceRate: 46,
    rating: 4.8,
    type: "Public Research University",
  },
  {
    name: "ETH Zurich",
    logo: G("ethz.ch"),
    country: "Switzerland",
    city: "Zurich",
    ranking: 7,
    website: "ethz.ch",
    description:
      "Europe's leading science and technology university, home to 21 Nobel Prize winners. Exceptional research in engineering, natural sciences, architecture, and mathematics.",
    acceptanceRate: 27,
    rating: 4.9,
    type: "Public Technical University",
  },
  {
    name: "University of Cambridge",
    logo: G("cam.ac.uk"),
    country: "United Kingdom",
    city: "Cambridge",
    ranking: 2,
    website: "cam.ac.uk",
    description:
      "One of the world's oldest and most prestigious universities, with 121 Nobel Prize winners. Excellence across sciences, engineering, law, humanities, and medicine.",
    acceptanceRate: 21,
    rating: 4.9,
    type: "Public Collegiate Research University",
  },
  {
    name: "University of Oxford",
    logo: G("ox.ac.uk"),
    country: "United Kingdom",
    city: "Oxford",
    ranking: 3,
    website: "ox.ac.uk",
    description:
      "The oldest university in the English-speaking world, consistently ranked in the top 3 globally. Famous for its tutorial system, research excellence, and distinguished alumni.",
    acceptanceRate: 18,
    rating: 4.9,
    type: "Public Collegiate Research University",
  },
  {
    name: "Stanford University",
    logo: G("stanford.edu"),
    country: "United States",
    city: "Stanford, CA",
    ranking: 5,
    website: "stanford.edu",
    description:
      "Silicon Valley's top research university, birthplace of Google and HP. World-leading in computer science, engineering, medicine, and business (GSB).",
    acceptanceRate: 4,
    rating: 4.9,
    type: "Private Research University",
  },
  {
    name: "MIT",
    logo: G("mit.edu"),
    country: "United States",
    city: "Cambridge, MA",
    ranking: 1,
    website: "mit.edu",
    description:
      "The world's #1 university for 12 consecutive years (QS). A global leader in science, technology, engineering, and math, with 97 Nobel laureates and groundbreaking innovation.",
    acceptanceRate: 4,
    rating: 4.9,
    type: "Private Research University",
  },
  {
    name: "Princeton University",
    logo: G("princeton.edu"),
    country: "United States",
    city: "Princeton, NJ",
    ranking: 17,
    website: "princeton.edu",
    description:
      "An Ivy League university known for its commitment to undergraduate teaching and pioneering research. Strong programs in mathematics, economics, public policy, and the humanities.",
    acceptanceRate: 5,
    rating: 4.9,
    type: "Private Ivy League University",
  },
  {
    name: "University of Melbourne",
    logo: G("unimelb.edu.au"),
    country: "Australia",
    city: "Melbourne",
    ranking: 33,
    website: "unimelb.edu.au",
    description:
      "Australia's #1 university, internationally recognized for research quality, cultural diversity, and graduate employability across medicine, engineering, and arts.",
    acceptanceRate: 70,
    rating: 4.8,
    type: "Public Research University",
  },
  {
    name: "University of Sydney",
    logo: G("sydney.edu.au"),
    country: "Australia",
    city: "Sydney",
    ranking: 41,
    website: "sydney.edu.au",
    description:
      "Australia's first university, founded in 1850. A research-intensive institution in the heart of Sydney with global impact across 17 professional schools.",
    acceptanceRate: 30,
    rating: 4.7,
    type: "Public Research University",
  },
  {
    name: "UNSW Sydney",
    logo: G("unsw.edu.au"),
    country: "Australia",
    city: "Sydney",
    ranking: 45,
    website: "unsw.edu.au",
    description:
      "One of Australia's leading research universities with strength in engineering, computing, business, and sciences. Known for industry-connected education.",
    acceptanceRate: 35,
    rating: 4.7,
    type: "Public Research University",
  },
  {
    name: "University of Queensland",
    logo: G("uq.edu.au"),
    country: "Australia",
    city: "Brisbane",
    ranking: 47,
    website: "uq.edu.au",
    description:
      "A world-top-50 research university known for pioneering discoveries including the HPV vaccine. Strong in health sciences, mining, and engineering.",
    acceptanceRate: 46,
    rating: 4.7,
    type: "Public Research University",
  },
  {
    name: "University of Warwick",
    logo: G("warwick.ac.uk"),
    country: "United Kingdom",
    city: "Coventry",
    ranking: 67,
    website: "warwick.ac.uk",
    description:
      "A dynamic campus university ranked in the UK top 10. Renowned for business, economics, mathematics, engineering, and computer science.",
    acceptanceRate: 14,
    rating: 4.6,
    type: "Public Research University",
  },
  {
    name: "University of Waterloo",
    logo: G("uwaterloo.ca"),
    country: "Canada",
    city: "Waterloo, ON",
    ranking: 112,
    website: "uwaterloo.ca",
    description:
      "Canada's top engineering and computer science university with the world's largest co-op program. A major tech hub connecting students with global employers.",
    acceptanceRate: 53,
    rating: 4.7,
    type: "Public Research University",
  },
  {
    name: "University of Chicago",
    logo: G("uchicago.edu"),
    country: "United States",
    city: "Chicago, IL",
    ranking: 11,
    website: "uchicago.edu",
    description:
      "Home to the Chicago School of Economics and 100+ Nobel laureates. Renowned for rigorous academics, innovative research, and the Booth School of Business.",
    acceptanceRate: 6,
    rating: 4.9,
    type: "Private Research University",
  },
  {
    name: "Yale University",
    logo: G("yale.edu"),
    country: "United States",
    city: "New Haven, CT",
    ranking: 16,
    website: "yale.edu",
    description:
      "An Ivy League powerhouse renowned for law, medicine, drama, and music. Yale's law school and drama school are consistently ranked #1 in the United States.",
    acceptanceRate: 5,
    rating: 4.9,
    type: "Private Ivy League University",
  },
  {
    name: "University of Amsterdam",
    logo: G("uva.nl"),
    country: "Netherlands",
    city: "Amsterdam",
    ranking: 53,
    website: "uva.nl",
    description:
      "One of Europe's most prestigious research universities, located in one of the world's most livable cities. Strong in social sciences, law, and humanities with English-taught programs.",
    acceptanceRate: 50,
    rating: 4.7,
    type: "Public Research University",
  },
  {
    name: "University of Auckland",
    logo: G("auckland.ac.nz"),
    country: "New Zealand",
    city: "Auckland",
    ranking: 65,
    website: "auckland.ac.nz",
    description:
      "New Zealand's top-ranked university and member of the Universitas 21 network. Strong in engineering, business, health sciences, and creative arts.",
    acceptanceRate: 65,
    rating: 4.6,
    type: "Public Research University",
  },
  {
    name: "Delft University of Technology",
    logo: G("tudelft.nl"),
    country: "Netherlands",
    city: "Delft",
    ranking: 54,
    website: "tudelft.nl",
    description:
      "Europe's top technical university and the Netherlands' largest. A global leader in engineering, architecture, and applied sciences with strong real-world impact.",
    acceptanceRate: 20,
    rating: 4.7,
    type: "Public Technical University",
  },
  {
    name: "University of Glasgow",
    logo: G("gla.ac.uk"),
    country: "United Kingdom",
    city: "Glasgow",
    ranking: 78,
    website: "gla.ac.uk",
    description:
      "One of the world's oldest universities, founded in 1451. Strong research across medicine, engineering, law, arts, and social sciences in Scotland's vibrant cultural capital.",
    acceptanceRate: 22,
    rating: 4.6,
    type: "Public Research University",
  },
  {
    name: "University of British Columbia",
    logo: G("ubc.ca"),
    country: "Canada",
    city: "Vancouver, BC",
    ranking: 34,
    website: "ubc.ca",
    description:
      "Canada's #3 university on a stunning campus in Vancouver. A global leader in sustainability, forestry, medicine, and technology with a vibrant international student community.",
    acceptanceRate: 52,
    rating: 4.8,
    type: "Public Research University",
  },
  {
    name: "Columbia University",
    logo: G("columbia.edu"),
    country: "United States",
    city: "New York, NY",
    ranking: 22,
    website: "columbia.edu",
    description:
      "An Ivy League institution in New York City, home to the Pulitzer Prize and renowned programs in journalism, business, law, and international affairs.",
    acceptanceRate: 4,
    rating: 4.9,
    type: "Private Ivy League University",
  },
  {
    name: "Imperial College London",
    logo: G("imperial.ac.uk"),
    country: "United Kingdom",
    city: "London",
    ranking: 6,
    website: "imperial.ac.uk",
    description:
      "One of the world's top science and technology universities, focused on science, engineering, medicine, and business. Alumni include Nobel Prize winners and industry leaders.",
    acceptanceRate: 14,
    rating: 4.9,
    type: "Public Research University",
  },
  {
    name: "University of Manchester",
    logo: G("manchester.ac.uk"),
    country: "United Kingdom",
    city: "Manchester",
    ranking: 32,
    website: "manchester.ac.uk",
    description:
      "A powerhouse of research with 25 Nobel Prize winners, home to graphene discovery. Strong in medicine, engineering, business, and social sciences.",
    acceptanceRate: 20,
    rating: 4.7,
    type: "Public Research University",
  },
  {
    name: "University of Edinburgh",
    logo: G("www.ed.ac.uk"),
    country: "United Kingdom",
    city: "Edinburgh",
    ranking: 27,
    website: "ed.ac.uk",
    description:
      "Scotland's flagship university, founded in 1583. Ranked in the world's top 30, with exceptional strength in AI, medicine, informatics, law, and the humanities.",
    acceptanceRate: 43,
    rating: 4.8,
    type: "Public Research University",
  },
];

const MARQUEE_COUNTRIES = [
  { flag: "🇺🇸", name: "United States", code: "us", programs: "4,200+" },
  { flag: "🇬🇧", name: "United Kingdom", code: "gb", programs: "3,800+" },
  { flag: "🇨🇦", name: "Canada", code: "ca", programs: "2,100+" },
  { flag: "🇦🇺", name: "Australia", code: "au", programs: "1,900+" },
  { flag: "🇩🇪", name: "Germany", code: "de", programs: "1,200+" },
  { flag: "🇸🇬", name: "Singapore", code: "sg", programs: "450+" },
  { flag: "🇳🇱", name: "Netherlands", code: "nl", programs: "890+" },
  { flag: "🇳🇿", name: "New Zealand", code: "nz", programs: "340+" },
  { flag: "🇮🇪", name: "Ireland", code: "ie", programs: "600+" },
  { flag: "🇫🇷", name: "France", code: "fr", programs: "750+" },
  { flag: "🇸🇪", name: "Sweden", code: "se", programs: "420+" },
  { flag: "🇨🇭", name: "Switzerland", code: "ch", programs: "310+" },
  { flag: "🇯🇵", name: "Japan", code: "jp", programs: "280+" },
  { flag: "🇰🇷", name: "South Korea", code: "kr", programs: "260+" },
  { flag: "🇦🇹", name: "Austria", code: "at", programs: "200+" },
  { flag: "🇩🇰", name: "Denmark", code: "dk", programs: "180+" },
];

const MARQUEE_COURSES: {
  name: string;
  emoji: string;
  color: string;
  bg: string;
}[] = [
  {
    name: "MSc Computer Science",
    emoji: "💻",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-100",
  },
  {
    name: "MBA Business Administration",
    emoji: "📊",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-100",
  },
  {
    name: "MSc Data Science & AI",
    emoji: "🤖",
    color: "text-violet-700",
    bg: "bg-violet-50 border-violet-100",
  },
  {
    name: "BEng Mechanical Engineering",
    emoji: "⚙️",
    color: "text-orange-700",
    bg: "bg-orange-50 border-orange-100",
  },
  {
    name: "MSc Electrical Engineering",
    emoji: "⚡",
    color: "text-yellow-700",
    bg: "bg-yellow-50 border-yellow-100",
  },
  {
    name: "MSc Cybersecurity",
    emoji: "🔐",
    color: "text-red-700",
    bg: "bg-red-50 border-red-100",
  },
  {
    name: "MSc Finance & Investment",
    emoji: "💰",
    color: "text-green-700",
    bg: "bg-green-50 border-green-100",
  },
  {
    name: "PhD Machine Learning",
    emoji: "🧠",
    color: "text-purple-700",
    bg: "bg-purple-50 border-purple-100",
  },
  {
    name: "MSc Public Health",
    emoji: "🏥",
    color: "text-pink-700",
    bg: "bg-pink-50 border-pink-100",
  },
  {
    name: "LLM International Law",
    emoji: "⚖️",
    color: "text-slate-700",
    bg: "bg-slate-50 border-slate-100",
  },
  {
    name: "MSc Biotechnology",
    emoji: "🧬",
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-100",
  },
  {
    name: "MA International Relations",
    emoji: "🌐",
    color: "text-cyan-700",
    bg: "bg-cyan-50 border-cyan-100",
  },
  {
    name: "MSc Software Engineering",
    emoji: "🖥️",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-100",
  },
  {
    name: "MSc Cloud Computing",
    emoji: "☁️",
    color: "text-sky-700",
    bg: "bg-sky-50 border-sky-100",
  },
  {
    name: "BBA Marketing Management",
    emoji: "📣",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-100",
  },
  {
    name: "MSc Environmental Science",
    emoji: "🌿",
    color: "text-lime-700",
    bg: "bg-lime-50 border-lime-100",
  },
  {
    name: "MSc Robotics",
    emoji: "🦾",
    color: "text-orange-700",
    bg: "bg-orange-50 border-orange-100",
  },
  {
    name: "PhD Artificial Intelligence",
    emoji: "🤖",
    color: "text-violet-700",
    bg: "bg-violet-50 border-violet-100",
  },
  {
    name: "MSc Architecture & Design",
    emoji: "🏛️",
    color: "text-stone-700",
    bg: "bg-stone-50 border-stone-100",
  },
  {
    name: "MSc Supply Chain Management",
    emoji: "🚚",
    color: "text-blue-500",
    bg: "bg-blue-50 border-blue-100",
  },
];

const COURSE_ICON_MAP: Array<[RegExp, React.ElementType]> = [
  [/computer science|software|cloud|cyber|computing/i, Monitor],
  [/mba|business|marketing|management|supply chain/i, Briefcase],
  [/engineering|robotics|mechanical|electrical/i, Cog],
  [/data science|machine learning|artificial intelligence|\bai\b/i, Brain],
  [/medicine|medical|health|biotechnology/i, Stethoscope],
  [/finance|investment/i, Activity],
  [/architecture|design/i, LayoutGrid],
  [/environmental|science|international/i, Globe],
];

const COURSE_PILL_STYLES: Record<string, { pill: string; icon: string }> = {
  "Computer Science": {
    pill: "bg-sky-50 border border-blue-100 text-blue-700 hover:bg-blue-100 hover:border-blue-300",
    icon: "bg-blue-500",
  },
  "Data Science & AI": {
    pill: "bg-violet-50 border border-violet-100 text-violet-700 hover:bg-violet-100 hover:border-violet-300",
    icon: "bg-violet-600",
  },
  "Business & MBA": {
    pill: "bg-amber-50 border border-amber-100 text-amber-700 hover:bg-amber-100 hover:border-amber-300",
    icon: "bg-amber-600",
  },
  Engineering: {
    pill: "bg-orange-50 border border-orange-100 text-orange-700 hover:bg-orange-100 hover:border-orange-300",
    icon: "bg-orange-600",
  },
  Medicine: {
    pill: "bg-red-50 border border-red-100 text-red-700 hover:bg-red-100 hover:border-red-300",
    icon: "bg-red-600",
  },
  Law: {
    pill: "bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300",
    icon: "bg-slate-600",
  },
  "Social Sciences": {
    pill: "bg-teal-50 border border-teal-100 text-teal-700 hover:bg-teal-100 hover:border-teal-300",
    icon: "bg-teal-600",
  },
  "Arts & Design": {
    pill: "bg-pink-50 border border-pink-100 text-pink-700 hover:bg-pink-100 hover:border-pink-300",
    icon: "bg-pink-600",
  },
  Other: {
    pill: "bg-purple-50 border border-purple-100 text-purple-700 hover:bg-purple-100 hover:border-purple-300",
    icon: "bg-purple-600",
  },
};

function getCourseIcon(name: string): React.ElementType {
  for (const [re, Icon] of COURSE_ICON_MAP) {
    if (re.test(name)) return Icon;
  }
  return BookOpen;
}

function getUniLogoUrl(name: string, website?: string): string | null {
  const found = MARQUEE_UNIS.find(
    (u) => u.name.toLowerCase() === name.toLowerCase(),
  );
  if (found) return found.logo;
  if (website) {
    const domain = website.replace(/^https?:\/\/(?:www\.)?/, "").split("/")[0];
    return G(domain);
  }
  return null;
}

function UniLogo({
  name,
  website,
  size = "sm",
  className = "",
}: {
  name: string;
  website?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [imgErr, setImgErr] = React.useState(false);
  const url = getUniLogoUrl(name, website);
  if (size === "sm") {
    if (!url || imgErr) {
      return (
        <span
          className={`w-7 h-7 rounded-full bg-[#0d1b4b] flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${className}`}
        >
          {name.charAt(0)}
        </span>
      );
    }
    return (
      <span
        className={`w-7 h-7 rounded-full bg-white border border-blue-200 shadow-xs flex items-center justify-center shrink-0 overflow-hidden p-0.5 ${className}`}
      >
        <img loading="lazy" decoding="async"
          src={url}
          alt=""
          onError={() => setImgErr(true)}
          className="w-full h-full object-contain"
        />
      </span>
    );
  }
  const dim = size === "md" ? "w-12 h-12" : "w-14 h-14";
  const pad = size === "md" ? "p-1.5" : "p-2";
  const textSize = size === "md" ? "text-lg" : "text-xl";
  if (!url || imgErr) {
    return (
      <div
        className={`${dim} bg-[#0d1b4b] rounded-xl flex items-center justify-center text-white font-bold ${textSize} shrink-0 ${className}`}
      >
        {name.charAt(0)}
      </div>
    );
  }
  return (
    <div
      className={`${dim} bg-white rounded-xl border border-gray-200 shadow-xs shrink-0 overflow-hidden ${pad} flex items-center justify-center ${className}`}
    >
      <img loading="lazy" decoding="async"
        src={url}
        alt=""
        onError={() => setImgErr(true)}
        className="w-full h-full object-contain"
      />
    </div>
  );
}

function CountryFlagImg({
  name,
  flag,
  sizeCls = "w-6 h-6",
  rounded = "rounded-full",
  className = "",
  quality = "w40",
}: {
  name: string;
  flag: string;
  sizeCls?: string;
  rounded?: string;
  className?: string;
  quality?: "w20" | "w40" | "w80" | "w160";
}) {
  const [imgErr, setImgErr] = React.useState(false);
  const code = FLAG_CODES[name];
  if (!code || imgErr) {
    return (
      <span
        className={`${sizeCls} ${rounded} ${className} bg-white border border-gray-200 shadow-xs flex items-center justify-center text-base leading-none shrink-0 overflow-hidden`}
      >
        {flag}
      </span>
    );
  }
  return (
    <img loading="lazy" decoding="async"
      src={`https://flagcdn.com/${quality}/${code}.png`}
      alt={name}
      onError={() => setImgErr(true)}
      className={`${sizeCls} ${rounded} ${className} object-cover shrink-0 shadow-xs border border-gray-200`}
    />
  );
}

const TABS = [
  "All",
  "Computer Science",
  "Business & MBA",
  "Engineering",
  "Data Science & AI",
  "Medicine",
];

const TAB_ICONS: Record<string, React.ElementType> = {
  All: LayoutGrid,
  "Computer Science": Monitor,
  "Business & MBA": Briefcase,
  Engineering: Cog,
  "Data Science & AI": Brain,
  Medicine: Stethoscope,
};

// Card badges are derived from the program's real data (see programBadge), never assigned at random
const BADGE_STYLES: Record<string, string> = {
  "Top Ranked": "bg-blue-100 text-blue-700",
  "Low Tuition": "bg-purple-100 text-purple-700",
};

function programBadge(ranking: number | undefined, fee: number): string | null {
  if (fee > 0 && fee <= 5000) return "Low Tuition";
  if (ranking && ranking <= 25) return "Top Ranked";
  return null;
}

const STEPS = [
  {
    title: "Register Free",
    desc: "Create your profile with academic background and goals.",
    num: "01",
  },
  {
    title: "Search Programs",
    desc: "Browse programs with smart filters that match your profile.",
    num: "02",
  },
  {
    title: "Meet Your Advisor",
    desc: "Get matched with a dedicated counselor specializing in your destination.",
    num: "03",
  },
  {
    title: "Apply with Support",
    desc: "Submit applications with full document assistance and SOP guidance.",
    num: "04",
  },
  {
    title: "Funding & Visa",
    desc: "Discover scholarships and get step-by-step visa application help.",
    num: "05",
  },
  {
    title: "Fly & Settle",
    desc: "Pre-departure briefing and arrival support to start your journey right.",
    num: "06",
  },
];

const TRACKER_DEMO = [
  {
    uni: "MIT",
    course: "MSc Computer Science & AI",
    flag: "🇺🇸",
    country: "United States",
    progress: 100,
    status: "Accepted",
    statusCls: "text-green-700 bg-green-100",
  },
  {
    uni: "University of Oxford",
    course: "MBA",
    flag: "🇬🇧",
    country: "United Kingdom",
    progress: 60,
    status: "Under Review",
    statusCls: "text-amber-700 bg-amber-100",
  },
  {
    uni: "TU Munich",
    course: "MSc Electrical Engineering",
    flag: "🇩🇪",
    country: "Germany",
    progress: 100,
    status: "Submitted",
    statusCls: "text-blue-700 bg-blue-100",
  },
  {
    uni: "University of Toronto",
    course: "MSc Data Science",
    flag: "🇨🇦",
    country: "Canada",
    progress: 40,
    status: "Docs Needed",
    statusCls: "text-orange-700 bg-orange-100",
  },
];

// Shown with initials. To use a photo, add `photo: "/team/<file>.jpg"` (a real photo of that person).
const TEAM: { name: string; role: string; exp: string; specialization: string; photo?: string }[] = [
  { name: "Rahul Mehta", role: "Founder & CEO", exp: "12 years", specialization: "UK & Europe" },
  { name: "Preethi Nair", role: "Senior Counselor", exp: "8 years", specialization: "Canada & USA" },
  { name: "Arjun Shetty", role: "Visa Expert", exp: "6 years", specialization: "Visa & Immigration" },
  { name: "Kavitha Reddy", role: "University Relations", exp: "5 years", specialization: "Australia & NZ" },
];

const TESTIMONIALS = [
  {
    name: "Priya Sharma",
    from: "🇮🇳 Bengaluru, India",
    uni: "University of Melbourne",
    rating: 5,
    text: "Gradzest helped me secure a scholarship for my Master's in Data Science at Melbourne. Their counselors guided me on every SOP, LOR, and visa step. Life-changing experience!",
  },
  {
    name: "Arjun Reddy",
    from: "🇮🇳 Hyderabad, India",
    uni: "University of Toronto",
    rating: 5,
    text: "I applied to 5 universities in Canada and got into my top choice MBA program. Gradzest made the whole process stress-free and incredibly smooth from start to finish.",
  },
  {
    name: "Divya Krishnan",
    from: "🇮🇳 Chennai, India",
    uni: "TU Munich",
    rating: 5,
    text: "Got into TU Munich's free tuition Engineering program! The scholarship and financial guidance from Gradzest saved my family lakhs. 100% recommend to every student.",
  },
  {
    name: "Rohit Nair",
    from: "🇮🇳 Kochi, India",
    uni: "University of Edinburgh",
    rating: 5,
    text: "My UK student visa was approved in just 3 weeks. Gradzest's end-to-end support — from shortlisting to pre-departure briefing — was absolutely outstanding.",
  },
];

const FAQS = [
  {
    q: "How does Gradzest help me study abroad?",
    a: "Gradzest provides end-to-end support — from shortlisting universities and programs that match your profile, to assisting with application documents, SOPs, LORs, scholarships, and visa applications. Our counselors guide you at every step until you land at your dream university.",
  },
  {
    q: "Is the counseling service free for students?",
    a: "Yes! Registering and getting initial counseling on Gradzest is completely free. Our platform connects you with expert advisors who help you find the right programs without any upfront cost.",
  },
  {
    q: "What documents do I need to apply for a university abroad?",
    a: "Typical requirements include academic transcripts, English proficiency scores (IELTS/TOEFL), a Statement of Purpose (SOP), Letters of Recommendation (LOR), a resume/CV, passport copy, and sometimes work experience certificates. Our counselors will give you a personalized checklist.",
  },
  {
    q: "How long does the entire application process take?",
    a: "The timeline varies by destination and intake. Generally, we recommend starting 12–18 months before your intended intake. Some countries like Canada and Australia have rolling intakes, while the UK and US have fixed deadlines. Our counselors help you plan your timeline carefully.",
  },
  {
    q: "Can Gradzest help me find scholarships?",
    a: "Absolutely. Our counselors help you identify merit-based, need-based, and country-specific scholarships you may be eligible for, and support you through the application.",
  },
  {
    q: "Do you help with student visas?",
    a: "Yes. Our visa specialists guide you through the documents, financial proof, and interview preparation for your destination, so your application is complete and well prepared.",
  },
  {
    q: `Which countries does ${BRAND} cover?`,
    a: `We currently support ${DESTINATIONS.length} study destinations: ${DESTINATIONS.map((d) => d.country).join(", ")}. Our counselors specialize in their respective regions.`,
  },
  {
    q: "How do I track my application status?",
    a: "Once registered on Gradzest, you get access to a real-time application tracker in your student dashboard. You can see the status of every application — from document submission to university decision — in one place.",
  },
];

// Maps a stagger step to a CSS delay class
const STAGGER: Record<number, string> = {
  0: "",
  60: "delay-60",
  80: "delay-80",
  90: "delay-90",
  100: "delay-100",
  120: "delay-120",
  160: "delay-160",
  180: "delay-180",
  200: "delay-200",
  240: "delay-240",
  270: "delay-270",
  300: "delay-300",
  320: "delay-320",
  360: "delay-360",
  400: "delay-400",
  420: "delay-420",
  450: "delay-450",
};

const COUNTRY_VISA_INFO: Record<
  string,
  {
    visa: string;
    processing: string;
    intake: string;
    minFunds: string;
    documents: string[];
    tip?: string;
  }
> = {
  "United States": {
    visa: "F-1 Student Visa",
    processing: "3–8 weeks",
    intake: "September, January",
    minFunds: "USD 25,000+/year",
    documents: [
      "I-20 form from university",
      "SEVIS fee receipt",
      "DS-160 online application",
      "IELTS/TOEFL scores",
      "Financial proof (bank statement)",
    ],
    tip: "Apply at least 3 months before your intake date",
  },
  "United Kingdom": {
    visa: "UK Student Visa",
    processing: "~3 weeks",
    intake: "September, January",
    minFunds: "GBP 1,334/month (London)",
    documents: [
      "CAS number from university",
      "IELTS Academic (5.5+)",
      "Bank statements (28-day history)",
      "Tuberculosis test result",
    ],
    tip: "Apply up to 6 months before course start",
  },
  Canada: {
    visa: "Study Permit",
    processing: "4–8 weeks",
    intake: "September, January, May",
    minFunds: "CAD 10,000+/year",
    documents: [
      "Acceptance letter",
      "IELTS/TOEFL scores",
      "Financial proof",
      "Statement of Purpose",
      "Biometrics",
    ],
    tip: "Apply online via the IRCC portal",
  },
  Australia: {
    visa: "Student Visa (Subclass 500)",
    processing: "4–6 weeks",
    intake: "February, July",
    minFunds: "AUD 21,041/year",
    documents: [
      "Confirmation of Enrolment (CoE)",
      "IELTS/PTE scores",
      "Health insurance (OSHC)",
      "Health examination",
      "GTE statement",
    ],
  },
  Germany: {
    visa: "National Visa for Study (D-Visa)",
    processing: "6–12 weeks",
    intake: "October, April",
    minFunds: "EUR 11,208/year (blocked account)",
    documents: [
      "University admission letter",
      "Blocked account proof",
      "Academic certificates",
      "Language proficiency proof",
      "Health insurance",
    ],
    tip: "Most public university programs are tuition-free",
  },
  Singapore: {
    visa: "Student Pass",
    processing: "4–8 weeks",
    intake: "August, January",
    minFunds: "SGD 1,500+/month",
    documents: [
      "University offer letter",
      "Financial proof",
      "Academic transcripts",
      "Passport copy",
    ],
    tip: "Apply via ICA SOLAR online system",
  },
  Netherlands: {
    visa: "MVV + Residence Permit",
    processing: "2–8 weeks",
    intake: "September, February",
    minFunds: "EUR 900/month",
    documents: [
      "University enrollment letter",
      "Financial proof",
      "Health insurance",
      "English proficiency proof",
    ],
    tip: "University typically assists with the permit application",
  },
  "New Zealand": {
    visa: "Student Visa",
    processing: "4–6 weeks",
    intake: "February, July",
    minFunds: "NZD 15,000+/year",
    documents: [
      "Offer of Place",
      "Financial proof",
      "English proficiency",
      "Medical certificate",
      "Police clearance",
    ],
  },
  Ireland: {
    visa: "Study Visa (C/D)",
    processing: "4–8 weeks",
    intake: "September, January",
    minFunds: "EUR 7,000+/year",
    documents: [
      "University acceptance letter",
      "Financial proof",
      "English proficiency",
      "Travel insurance",
    ],
  },
  France: {
    visa: "Long-stay Student Visa (VLS-TS)",
    processing: "3–4 weeks",
    intake: "September, January",
    minFunds: "EUR 615/month",
    documents: [
      "University enrollment proof",
      "Campus France registration",
      "Financial proof",
      "French/English proficiency",
    ],
    tip: "Campus France interview may be required",
  },
  Sweden: {
    visa: "Residence Permit for Studies",
    processing: "2–4 months",
    intake: "September, January",
    minFunds: "SEK 9,520/month",
    documents: [
      "Admission letter",
      "Financial proof",
      "Health insurance",
      "Language proficiency",
    ],
  },
  Switzerland: {
    visa: "Student Residence Permit (D Visa)",
    processing: "4–8 weeks",
    intake: "September, February",
    minFunds: "CHF 21,000/year",
    documents: [
      "Enrollment letter",
      "Financial proof",
      "Health insurance",
      "Language proficiency",
    ],
  },
  Japan: {
    visa: "College Student Visa",
    processing: "1–3 months",
    intake: "April, October",
    minFunds: "JPY 120,000/month",
    documents: [
      "Certificate of Eligibility",
      "Financial proof",
      "Academic records",
      "Japanese language certificate (N2 preferred)",
    ],
  },
  "South Korea": {
    visa: "D-2 Student Visa",
    processing: "4–6 weeks",
    intake: "March, September",
    minFunds: "KRW 9,000,000/year",
    documents: [
      "University admission letter",
      "Financial proof",
      "Academic transcripts",
      "TOPIK certificate (preferred)",
    ],
  },
  Austria: {
    visa: "Student Visa (D-Visa)",
    processing: "6–10 weeks",
    intake: "October, March",
    minFunds: "EUR 12,000/year",
    documents: [
      "University acceptance letter",
      "Financial proof",
      "Health insurance",
      "Language proficiency",
    ],
  },
  Denmark: {
    visa: "Residence Permit for Studies",
    processing: "2–4 months",
    intake: "September, February",
    minFunds: "DKK 6,397/month",
    documents: [
      "Admission letter",
      "Financial proof",
      "Health insurance",
      "Language proficiency",
    ],
  },
};

function getField(name: string): string {
  const n = (name || "").toLowerCase();
  if (/computer|software|information|informatics/.test(n)) return "Computer Science";
  if (/\bdata\b|\bai\b|artificial|machine learning|analytics/.test(n) && !/business/.test(n)) return "Data Science & AI";
  if (/business|\bmba\b|management|finance|accounting|economics/.test(n)) return "Business & MBA";
  if (/engineer|electrical|mechanical|civil|robotics/.test(n)) return "Engineering";
  if (/medicine|medical|health|pharmacy|nursing|mbchb|dentistry/.test(n)) return "Medicine";
  if (/\blaw\b|\bllb\b|\bllm\b|legal/.test(n)) return "Law";
  if (/psychology|sociology|social|political|international relations/.test(n)) return "Social Sciences";
  if (/architecture|design|\barts?\b|media|music|film/.test(n)) return "Arts & Design";
  return "Other";
}

function progressWidth(pct: number): string {
  if (pct >= 100) return "w-full";
  if (pct >= 75) return "w-3/4";
  if (pct >= 60) return "w-3/5";
  if (pct >= 50) return "w-1/2";
  if (pct >= 40) return "w-2/5";
  if (pct >= 25) return "w-1/4";
  return "w-1/5";
}

function inferCourseLevel(name: string): string {
  const n = name.toLowerCase();
  if (n.startsWith("phd") || n.startsWith("doctorate")) return "PhD";
  if (n.startsWith("beng") || n.startsWith("bba") || n.startsWith("bachelor"))
    return "Bachelor's";
  return "Master's";
}

function inferCourseDuration(name: string): string {
  const n = name.toLowerCase();
  if (n.startsWith("phd")) return "3–5 years";
  if (n.startsWith("mba")) return "1–2 years";
  if (n.startsWith("beng") || n.startsWith("bba")) return "3–4 years";
  return "1–2 years";
}

function DetailModal({
  modal,
  onClose,
  universities,
  allPrograms,
  navigate,
}: {
  modal: {
    type: "university" | "country" | "course";
    name: string;
    flag?: string;
  } | null;
  onClose: () => void;
  universities: any[];
  allPrograms: {
    key: string;
    uniId: any;
    uni: string;
    website?: string;
    course: string;
    country: string;
    city: string;
    flag: string;
    level: string;
    duration: string;
    fee: string;
    badge: string;
    field: string;
  }[];
  navigate: (path: string) => void;
}) {
  if (!modal) return null;

  const renderContent = () => {
    if (modal.type === "university") {
      const uni = universities.find(
        (u) =>
          u.name === modal.name ||
          u.name?.toLowerCase() === modal.name.toLowerCase(),
      );
      if (uni) {
        return (
          <>
            <div className="bg-linear-to-br from-blue-500 to-indigo-600 p-6 text-white relative rounded-t-2xl">
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 rounded-full p-1.5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              {getUniLogoUrl(uni.name, uni.website) ? (
                <UniLogo
                  name={uni.name}
                  website={uni.website}
                  size="lg"
                  className="mb-3"
                />
              ) : (
                <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center font-bold text-2xl mb-3">
                  {uni.name.charAt(0)}
                </div>
              )}
              <h2 className="text-xl font-bold pr-10">{uni.name}</h2>
              <p className="text-sky-100 text-sm mt-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {uni.city}, {uni.country}
                {uni.type && (
                  <span className="ml-1 opacity-70">• {uni.type}</span>
                )}
              </p>
              <div className="flex gap-2 mt-3 flex-wrap">
                <span className="bg-white/20 text-xs px-2.5 py-1 rounded-full font-medium">
                  #{uni.ranking} World
                </span>
                <span className="flex items-center gap-1 bg-white/20 text-xs px-2.5 py-1 rounded-full">
                  <Star className="w-3 h-3 fill-yellow-300 text-yellow-300" />
                  {uni.rating}
                </span>
                {uni.acceptanceRate && (
                  <span className="bg-white/20 text-xs px-2.5 py-1 rounded-full">
                    {uni.acceptanceRate}% acceptance
                  </span>
                )}
              </div>
            </div>
            <div className="p-5 space-y-4">
              {uni.description && (
                <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                  {uni.description}
                </p>
              )}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-[#f0f4ff] rounded-xl p-3">
                  <p className="font-bold text-[#0d1b4b] text-lg">
                    {(uni.courses || []).length}
                  </p>
                  <p className="text-xs text-gray-500">Programs</p>
                </div>
                <div className="bg-[#f0f4ff] rounded-xl p-3">
                  <p className="font-bold text-[#0d1b4b] text-lg">
                    {uni.totalStudents
                      ? `${(uni.totalStudents / 1000).toFixed(0)}k`
                      : "N/A"}
                  </p>
                  <p className="text-xs text-gray-500">Students</p>
                </div>
                <div className="bg-[#f0f4ff] rounded-xl p-3">
                  <p className="font-bold text-[#0d1b4b] text-sm">
                    {uni.averageFees?.postgraduate > 0
                      ? `${uni.averageFees.currency} ${(uni.averageFees.postgraduate / 1000).toFixed(0)}k`
                      : "Free/Varies"}
                  </p>
                  <p className="text-xs text-gray-500">PG/year</p>
                </div>
              </div>
              {uni.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {uni.tags.slice(0, 5).map((t: string) => (
                    <span
                      key={t}
                      className="text-xs bg-[#f0f4ff] text-[#0d1b4b] px-2 py-0.5 rounded-full"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {uni.facilities?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Campus Facilities
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {uni.facilities.slice(0, 6).map((f: string) => (
                      <span
                        key={f}
                        className="flex items-center gap-1 text-xs text-gray-600"
                      >
                        <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate(`/university/${uni.id}`);
                }}
                className="w-full bg-[#0d1b4b] text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-[#152258] transition-colors flex items-center justify-center gap-2"
              >
                View Full Profile <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        );
      }
      const mu = MARQUEE_UNIS.find(
        (m) =>
          m.name === modal.name ||
          m.name.toLowerCase() === modal.name.toLowerCase(),
      );
      if (mu) {
        return (
          <>
            <div className="bg-linear-to-br from-blue-500 to-indigo-600 p-6 text-white relative rounded-t-2xl">
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 rounded-full p-1.5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="w-16 h-12 bg-white rounded-xl flex items-center justify-center overflow-hidden p-1.5 mb-3">
                <img loading="lazy" decoding="async"
                  src={mu.logo}
                  alt={mu.name}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              </div>
              <h2 className="text-xl font-bold pr-10">{mu.name}</h2>
              <p className="text-sky-100 text-sm mt-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {mu.city}, {mu.country}{" "}
                <span className="opacity-70 ml-1">• {mu.type}</span>
              </p>
              <div className="flex gap-2 mt-3 flex-wrap">
                <span className="bg-white/20 text-xs px-2.5 py-1 rounded-full font-medium">
                  #{mu.ranking} World Rank
                </span>
                <span className="flex items-center gap-1 bg-white/20 text-xs px-2.5 py-1 rounded-full">
                  <Star className="w-3 h-3 fill-yellow-300 text-yellow-300" />
                  {mu.rating}
                </span>
                <span className="bg-white/20 text-xs px-2.5 py-1 rounded-full">
                  {mu.acceptanceRate}% acceptance
                </span>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                {mu.description}
              </p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-[#f0f4ff] rounded-xl p-3">
                  <p className="font-bold text-[#0d1b4b] text-lg">
                    #{mu.ranking}
                  </p>
                  <p className="text-xs text-gray-500">World Rank</p>
                </div>
                <div className="bg-[#f0f4ff] rounded-xl p-3">
                  <p className="font-bold text-[#0d1b4b] text-lg">
                    {mu.acceptanceRate}%
                  </p>
                  <p className="text-xs text-gray-500">Acceptance</p>
                </div>
                <div className="bg-[#f0f4ff] rounded-xl p-3">
                  <p className="font-bold text-[#0d1b4b] text-lg">
                    {mu.rating}⭐
                  </p>
                  <p className="text-xs text-gray-500">Rating</p>
                </div>
              </div>
              <a
                href={`https://${mu.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-[#0d1b4b] text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-[#152258] transition-colors flex items-center justify-center gap-2"
              >
                <Globe className="w-4 h-4" /> Visit Official Website
              </a>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate(`/search?country=${encodeURIComponent(mu.country)}`);
                }}
                className="w-full bg-sky-50 text-[#0d1b4b] border border-sky-200 py-2.5 rounded-xl font-semibold text-sm hover:bg-sky-100 transition-colors flex items-center justify-center gap-2"
              >
                Explore Programs in {mu.country}{" "}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        );
      }
      return (
        <>
          <div className="bg-linear-to-br from-blue-500 to-indigo-600 p-6 text-white relative rounded-t-2xl">
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 rounded-full p-1.5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center text-2xl mb-3">
              🎓
            </div>
            <h2 className="text-xl font-bold pr-10">{modal.name}</h2>
            <p className="text-sky-100 text-sm mt-1">
              World-renowned research university
            </p>
          </div>
          <div className="p-5">
            <p className="text-sm text-gray-600 mb-5 leading-relaxed">
              {modal.name} is one of the world's leading research universities,
              known for academic excellence and global impact. Contact a
              Gradzest counselor to explore admission pathways.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate("/universities");
              }}
              className="w-full bg-[#0d1b4b] text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-[#152258] transition-colors flex items-center justify-center gap-2"
            >
              Browse Partner Universities <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </>
      );
    }

    if (modal.type === "country") {
      const info = COUNTRY_VISA_INFO[modal.name];
      return (
        <>
          <div className="bg-linear-to-br from-emerald-500 to-teal-600 p-6 text-white relative rounded-t-2xl">
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 rounded-full p-1.5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="mb-3">
              <CountryFlagImg
                name={modal.name}
                flag={modal.flag || "🌍"}
                sizeCls="w-24 h-16"
                rounded="rounded-xl"
                className="shadow-lg"
                quality="w160"
              />
            </div>
            <h2 className="text-xl font-bold">{modal.name}</h2>
            {info && (
              <p className="text-emerald-100 text-sm mt-1">{info.visa}</p>
            )}
          </div>
          <div className="p-5 space-y-4">
            {info ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock className="w-3.5 h-3.5 text-emerald-600" />
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Processing
                      </p>
                    </div>
                    <p className="font-bold text-gray-900 text-sm">
                      {info.processing}
                    </p>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Intakes
                      </p>
                    </div>
                    <p className="font-bold text-gray-900 text-sm">
                      {info.intake}
                    </p>
                  </div>
                </div>
                <div className="bg-[#f0f4ff] rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <DollarSign className="w-3.5 h-3.5 text-[#0d1b4b]" />
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Min. Funds Required
                    </p>
                  </div>
                  <p className="font-bold text-[#0d1b4b] text-sm">
                    {info.minFunds}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Required Documents
                  </p>
                  <div className="space-y-1.5">
                    {info.documents.map((doc) => (
                      <div key={doc} className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700">{doc}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {info.tip && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                    <span className="text-base">💡</span>
                    <p className="text-sm text-amber-800">{info.tip}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">
                Explore study opportunities in {modal.name}. Our counselors can
                guide you through visa requirements, university applications,
                and scholarship options.
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/search?country=${encodeURIComponent(modal.name)}`);
              }}
              className="w-full bg-emerald-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
            >
              Explore Programs in {modal.name}{" "}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </>
      );
    }

    if (modal.type === "course") {
      const matches = allPrograms.filter(
        (p) =>
          p.course === modal.name ||
          p.course?.toLowerCase().includes(modal.name.toLowerCase()) ||
          modal.name.toLowerCase().includes(p.course?.toLowerCase() || ""),
      );
      const level = inferCourseLevel(modal.name);
      const duration = inferCourseDuration(modal.name);
      const field = getField(modal.name);
      return (
        <>
          <div className="bg-linear-to-br from-purple-500 to-violet-600 p-6 text-white relative rounded-t-2xl">
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 rounded-full p-1.5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center text-2xl mb-3">
              📚
            </div>
            <h2 className="text-xl font-bold pr-10 leading-tight">
              {modal.name}
            </h2>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="bg-white/20 text-xs px-2.5 py-1 rounded-full font-medium">
                {level}
              </span>
              {field !== "Other" && (
                <span className="bg-white/20 text-xs px-2.5 py-1 rounded-full">
                  {field}
                </span>
              )}
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-purple-50 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="w-3.5 h-3.5 text-purple-600" />
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Duration
                  </p>
                </div>
                <p className="font-bold text-gray-900 text-sm">
                  {matches[0]?.duration || duration}
                </p>
              </div>
              <div className="bg-purple-50 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-purple-600" />
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Tuition
                  </p>
                </div>
                <p className="font-bold text-gray-900 text-sm">
                  {matches[0]?.fee || "Varies by university"}
                </p>
              </div>
            </div>
            {matches.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Available At ({matches.length}{" "}
                  {matches.length === 1 ? "university" : "universities"})
                </p>
                <div className="space-y-2">
                  {matches.slice(0, 3).map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => {
                        onClose();
                        navigate(`/university/${p.uniId}`);
                      }}
                      className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-purple-50 transition-colors text-left"
                    >
                      {getUniLogoUrl(p.uni, p.website) ? (
                        <div className="w-9 h-9 bg-white rounded-lg border border-gray-200 shadow-xs shrink-0 overflow-hidden p-1 flex items-center justify-center">
                          <img loading="lazy" decoding="async"
                            src={getUniLogoUrl(p.uni, p.website)!}
                            alt=""
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-9 h-9 bg-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0">
                          {p.uni.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-gray-900 truncate">
                          {p.uni}
                        </p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <CountryFlagImg
                            name={p.country}
                            flag={p.flag}
                            sizeCls="w-4 h-3"
                            rounded="rounded-xs"
                            quality="w40"
                          />
                          {p.city}, {p.country}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/search?q=${encodeURIComponent(modal.name)}`);
              }}
              className="w-full bg-purple-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
            >
              Search This Program <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </>
      );
    }
    return null;
  };

  return (
    <div role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div role="presentation"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {renderContent()}
      </div>
    </div>
  );
}

/* ── Animation helpers ── */

function FadeIn({
  children,
  className = "",
  delayClass = "",
  direction = "up",
}: {
  children: React.ReactNode;
  className?: string;
  delayClass?: string;
  direction?: "up" | "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const dirClass =
    direction === "left"
      ? "animate-fade-in-left"
      : direction === "right"
        ? "animate-fade-in-right"
        : "animate-fade-in-up";
  return (
    <div
      ref={ref}
      className={`${className} ${delayClass} ${visible ? dirClass : "opacity-0"}`}
    >
      {children}
    </div>
  );
}

/* ── Page component ── */

export default function Home() {
  const { isAuthenticated, user } = useAuth();
  const { open } = useAuthModal();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [universities, setUniversities] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("All");
  const [destination, setDestination] = useState("");
  const [field, setField] = useState("");
  const [level, setLevel] = useState("");
  const [subName, setSubName] = useState("");
  const [email, setEmail] = useState("");
  const [subPhone, setSubPhone] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [detailModal, setDetailModal] = useState<{
    type: "university" | "country" | "course";
    name: string;
    flag?: string;
  } | null>(null);

  useEffect(() => {
    api.universities
      .list()
      .then(setUniversities)
      .catch(() => {});
  }, []);

  // Scroll to a section when arriving via a link like /#how-it-works
  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
    }, 100);
    return () => clearTimeout(t);
  }, [hash]);

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (destination) params.set("country", destination);
    if (level) params.set("level", level);
    navigate(`/search?${params.toString()}`);
  };

  const handleApply = () => {
    if (isAuthenticated && user?.role === "student")
      navigate("/student/applications");
    else open("register");
  };

  const handleSubscribe = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    setSubLoading(true);
    setSubError("");
    try {
      await api.subscribe({
        name: subName.trim(),
        email: trimmedEmail,
        phone: subPhone.trim(),
      });
      setSubscribed(true);
      setSubName("");
      setEmail("");
      setSubPhone("");
    } catch (err: any) {
      setSubError(
        err.message === "Already subscribed"
          ? "This email is already subscribed."
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubLoading(false);
    }
  };

  const countries = [
    ...new Set(universities.map((u: any) => u.country)),
  ].sort();

  const allPrograms = universities.flatMap((u: any) =>
    (u.courses || []).map((c: any, ci: number) => {
      const level = c.level || inferCourseLevel(c.name || "");
      const isUG = /bachelor/i.test(level);
      // Course tuition if set, otherwise the university's average for that level
      const rawFee: number = c.tuition || (isUG ? u.averageFees?.undergraduate : u.averageFees?.postgraduate) || 0;
      // Guard against data-entry errors (e.g. 25,555,555/yr) — show "Contact us" instead
      const feeValue = rawFee > 150000 ? 0 : rawFee;
      return {
        key: `${u.id}-${ci}`,
        uniId: u.id,
        uni: u.name,
        website: u.website,
        course: c.name,
        country: u.country,
        city: u.city,
        flag: FLAGS[u.country] || "🌍",
        level,
        duration: c.duration || inferCourseDuration(c.name || ""),
        feeIsAverage: !c.tuition,
        fee: feeValue ? `${u.averageFees?.currency || ""} ${feeValue.toLocaleString()}/yr` : "Contact us",
        badge: programBadge(u.ranking, feeValue),
        field: getField(c.name),
      };
    }),
  );

  // One card per university so the grid shows variety instead of near-duplicates
  const filteredPrograms = (
    activeTab === "All" ? allPrograms : allPrograms.filter((p) => p.field === activeTab)
  )
    .filter((p, i, arr) => arr.findIndex((q) => q.uniId === p.uniId) === i)
    .slice(0, 6);

  return (
    <div className="min-h-screen bg-white">
      {/* ── HERO ── */}
      <section className="relative bg-[#0d1540] pt-16 pb-24 overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-800/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-80 h-80 bg-blue-900/20 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="animate-fade-in-up inline-flex items-center gap-2 bg-black/30 text-white border border-white/10 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <span className="w-2 h-2 bg-green-400 rounded-full inline-block shrink-0" />
            Backed by Gradzest expert advisors
          </div>
          <div className="animate-fade-in-up delay-80">
            <h1 className="text-5xl lg:text-7xl lg:leading-(--text-7xl--line-height) font-extrabold text-white leading-tight mb-5 tracking-tight">
              Find Your <span className="text-cyan-300">Perfect Program</span>
              <br />to Study Abroad
            </h1>
          </div>
          <div className="animate-fade-in-up delay-160">
            <p className="text-lg text-blue-200/70 mb-8 max-w-2xl mx-auto leading-relaxed">
              {HERO_TAGLINE}
              <br />Free to apply — our advisors guide you every step of the way.
            </p>
          </div>

          {!isAuthenticated && (
            <div className="animate-fade-in-up delay-240 flex items-center justify-center gap-3 mb-8">
              <button
                type="button"
                onClick={() => open("register")}
                className="bg-blue-500 hover:bg-blue-400 text-white font-bold px-8 py-3.5 rounded-xl active:scale-95 transition-all shadow-lg shadow-blue-500/40 flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" /> Start Free Today
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => document.getElementById("talk-to-advisor")?.scrollIntoView({ behavior: "smooth" })}
                className="bg-white/10 border border-white/30 text-white font-semibold px-8 py-3.5 rounded-xl hover:bg-white/20 active:scale-95 transition-all flex items-center gap-2"
              >
                <MessageCircle className="w-4 h-4" /> Talk to an Advisor
              </button>
            </div>
          )}

          {/* Search box */}
          <div className="animate-fade-in-up delay-320 bg-white rounded-2xl shadow-xl p-3 max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <select
                  aria-label="Select destination country"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 text-sm text-gray-700 focus:outline-hidden bg-gray-50 rounded-xl appearance-none border-0"
                >
                  <option value="">Destination</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="hidden md:block w-px bg-gray-200 my-1" />
              <div className="flex-1 relative">
                <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <select
                  aria-label="Select field of study"
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 text-sm text-gray-700 focus:outline-hidden bg-gray-50 rounded-xl appearance-none border-0"
                >
                  <option value="">Field of Study</option>
                  {[
                    "Computer Science",
                    "Engineering",
                    "Business & MBA",
                    "Data Science & AI",
                    "Medicine",
                    "Law",
                    "Arts & Design",
                  ].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="hidden md:block w-px bg-gray-200 my-1" />
              <div className="flex-1 relative">
                <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <select
                  aria-label="Select degree level"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 text-sm text-gray-700 focus:outline-hidden bg-gray-50 rounded-xl appearance-none border-0"
                >
                  <option value="">Degree Level</option>
                  {[
                    "Bachelor's",
                    "Master's",
                    "PhD",
                    "Diploma",
                    "Certificate",
                  ].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleSearch}
                className="bg-[#0d1b4b] hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-semibold active:scale-95 transition-all flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Search className="w-4 h-4" /> Search Programs
              </button>
            </div>
          </div>

          {/* Popular tags */}
          <div className="animate-fade-in-up delay-400 flex flex-wrap justify-center gap-2 mt-5 items-center">
            <span className="text-sm text-blue-100">Popular:</span>
            {[
              { label: "Canada", param: "country=Canada", flagCode: "ca" },
              { label: "Germany", param: "country=Germany", flagCode: "de" },
              { label: "Computer Science", param: "q=Computer+Science", Icon: Monitor },
              { label: "Master's", param: "level=Master", Icon: GraduationCap },
              { label: "Scholarship", param: "q=scholarship", Icon: Star },
            ].map((tag) => (
              <button
                key={tag.label}
                type="button"
                onClick={() => navigate(`/search?${tag.param}`)}
                className="text-sm text-white hover:text-white bg-white/15 hover:bg-white/25 border border-white/20 active:scale-95 px-3 py-1 rounded-full transition-all flex items-center gap-1.5"
              >
                {tag.flagCode ? (
                  <img loading="lazy" decoding="async" src={`https://flagcdn.com/w40/${tag.flagCode}.png`} alt="" width={16} height={12}
                    className="w-4 h-3 rounded-xs object-cover" />
                ) : tag.Icon ? (
                  <tag.Icon className="w-3.5 h-3.5" aria-hidden="true" />
                ) : null}
                {tag.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="bg-white py-12 border-b border-gray-100" aria-label={`${BRAND} at a glance`}>
        <div className="max-w-5xl mx-auto px-4">
          {/* Values come from siteFacts and are in the HTML from the first paint (no count-up) */}
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {HIGHLIGHTS.map((s) => (
              <div key={s.label} className="flex flex-col-reverse">
                <dt className="text-sm text-gray-500 mt-1">{s.label}</dt>
                <dd className="text-3xl font-extrabold text-[#0d1b4b] font-display">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── SCROLLING TICKER ── */}
      <section className="py-12 bg-white border-y border-gray-100 overflow-hidden">
        <div className="text-center mb-8">
          <span className="inline-block bg-blue-50 text-blue-500 text-xs font-semibold px-3 py-1 rounded-full mb-3 uppercase tracking-widest">Our Global Network</span>
          <h3 className="text-2xl font-bold text-gray-900">Explore Destinations, Universities &amp; Courses</h3>
          <p className="text-gray-400 text-sm mt-2">Click any card to see visa info, rankings, and more</p>
        </div>

        {/* Row 1 — Countries scrolling left */}
        <div className="marquee-wrap overflow-hidden mb-4">
          <div className="flex animate-marquee-left w-max">
            {[...MARQUEE_COUNTRIES, ...MARQUEE_COUNTRIES].map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() =>
                  setDetailModal({
                    type: "country",
                    name: c.name,
                    flag: c.flag,
                  })
                }
                className="inline-flex items-center gap-3 mx-2 px-4 py-3 bg-white border border-gray-100 rounded-2xl shadow-xs hover:shadow-md hover:border-gray-200 transition-all shrink-0 cursor-pointer group"
              >
                <div className="w-10 h-7 rounded-lg overflow-hidden shrink-0 shadow-xs border border-gray-100">
                  <img
                    src={`https://flagcdn.com/w80/${c.code}.png`}
                    alt={c.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-800 whitespace-nowrap group-hover:text-[#0d1b4b] transition-colors">
                    {c.name}
                  </p>
                  <p className="text-xs text-gray-400">{c.programs} programs</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Row 2 — Universities scrolling right */}
        <div className="marquee-wrap overflow-hidden mb-4">
          <div className="flex animate-marquee-right w-max">
            {[...MARQUEE_UNIS, ...MARQUEE_UNIS].map((uni, i) => (
              <button
                key={i}
                type="button"
                onClick={() =>
                  setDetailModal({ type: "university", name: uni.name })
                }
                className="inline-flex items-center gap-3 mx-2 px-4 py-3 bg-white border border-gray-100 rounded-2xl shadow-xs hover:shadow-md hover:border-gray-200 transition-all shrink-0 cursor-pointer group"
              >
                <div className="w-14 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center overflow-hidden shrink-0 p-1">
                  <img
                    src={uni.logo}
                    alt={uni.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      const t = e.currentTarget;
                      t.style.display = "none";
                      const fb = t.nextElementSibling as HTMLElement | null;
                      if (fb) fb.style.display = "flex";
                    }}
                  />
                  <span className="w-full h-full bg-[#0d1b4b] rounded-lg text-white text-[10px] font-bold items-center justify-center hidden leading-tight text-center px-0.5">
                    {uni.name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 3)}
                  </span>
                </div>
                <span className="text-sm font-semibold text-gray-800 whitespace-nowrap group-hover:text-[#0d1b4b] transition-colors">
                  {uni.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Row 3 — Courses scrolling left */}
        <div className="marquee-wrap overflow-hidden">
          <div className="flex animate-marquee-left2 w-max">
            {[...MARQUEE_COURSES, ...MARQUEE_COURSES].map((course, i) => (
              <button
                key={i}
                type="button"
                onClick={() =>
                  setDetailModal({ type: "course", name: course.name })
                }
                className={`inline-flex items-center gap-3 mx-2 px-4 py-3 bg-white border rounded-2xl shadow-xs hover:shadow-md transition-all shrink-0 cursor-pointer group ${course.bg}`}
              >
                <span className="text-xl leading-none shrink-0">
                  {course.emoji}
                </span>
                <span
                  className={`text-sm font-semibold whitespace-nowrap ${course.color}`}
                >
                  {course.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── ABOUT US ── */}
      <section id="about" className="py-16 bg-[#eef2ff] scroll-mt-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <FadeIn direction="left">
              <span className="inline-block bg-blue-100 text-blue-500 text-xs font-semibold px-3 py-1 rounded-full mb-4 uppercase tracking-wide">
                About {BRAND}
              </span>
              <h2 className="text-3xl font-extrabold text-gray-900 mb-4 leading-tight">
                We Make Studying Abroad<br/>
                <span className="text-[#0d1b4b]">Simple, <span className="text-blue-500">Stress-Free</span> & Successful</span>
              </h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                {BRAND} is a study abroad platform built for Indian students. We connect ambitious students with the right universities, the right programs, and the right support — completely free.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                From shortlisting universities and writing your SOP, to scholarship hunting and visa prep — our expert counselors handle every step so you can focus on your future.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/universities"
                  className="inline-flex items-center gap-2 bg-blue-500 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-blue-600 active:scale-95 transition-all text-sm"
                >
                  <BookOpen className="w-4 h-4" /> Browse Programs{" "}
                  <ChevronRight className="w-4 h-4" />
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    isAuthenticated
                      ? navigate(
                          user?.role === "student"
                            ? "/student"
                            : user?.role === "counselor"
                              ? "/counselor"
                              : "/admin",
                        )
                      : open("register")
                  }
                  className="inline-flex items-center gap-2 bg-white border border-blue-200 text-blue-500 font-semibold px-5 py-2.5 rounded-xl hover:bg-blue-50 active:scale-95 transition-all text-sm"
                >
                  <UserPlus className="w-4 h-4" /> Get Free Counseling
                </button>
              </div>
            </FadeIn>
            <FadeIn direction="right">
              {/* What students get — no repeated figures here; those live once in the stats strip */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { Icon: BookOpen, label: "Program shortlisting", desc: "Matched to your profile", to: "/universities" },
                  { Icon: CheckCircle, label: "SOP & document help", desc: "Reviewed by counselors", to: null },
                  { Icon: DollarSign, label: "Scholarship guidance", desc: "Find funding you qualify for", to: "/search?q=scholarship" },
                  { Icon: Globe, label: "Visa preparation", desc: "Documents & interview prep", to: null },
                ].map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => (s.to ? navigate(s.to) : document.getElementById("talk-to-advisor")?.scrollIntoView({ behavior: "smooth" }))}
                    className="bg-white rounded-2xl p-5 text-center border border-blue-100 hover:border-blue-300 hover:shadow-md active:scale-95 transition-all cursor-pointer group"
                  >
                    <s.Icon className="w-6 h-6 text-[#0d1b4b] mx-auto mb-2" aria-hidden="true" />
                    <div className="text-gray-900 text-sm font-semibold">{s.label}</div>
                    <div className="text-gray-400 text-xs mt-1.5 flex items-center justify-center gap-1 group-hover:text-[#0d1b4b] transition-colors">
                      {s.desc} <ChevronRight className="w-3 h-3" />
                    </div>
                  </button>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── FEATURED PROGRAMS ── */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="flex items-end justify-between mb-8">
            <div>
              <span className="inline-block bg-blue-50 text-blue-500 text-xs font-semibold px-3 py-1 rounded-full mb-3 uppercase tracking-wide">Top Programs</span>
              <h2 className="text-3xl font-extrabold text-gray-900">
                Featured <span className="text-blue-500">Programs</span>
              </h2>
              <p className="text-gray-500 mt-2">
                Handpicked programs from world's top-ranked universities
              </p>
            </div>
            <Link
              to="/universities"
              className="hidden md:flex items-center gap-1 text-[#0d1b4b] font-medium hover:text-[#1a2d6e] text-sm"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </FadeIn>

          {/* Filter tabs */}
          <FadeIn
            className="flex gap-2 overflow-x-auto pb-2 mb-8"
            delayClass="delay-80"
          >
            {TABS.map((tab) => {
              const Icon = TAB_ICONS[tab];
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95 ${activeTab === tab ? "bg-[#0d1b4b] text-white shadow-xs scale-105" : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab}
                </button>
              );
            })}
          </FadeIn>

          {/* Program cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredPrograms.map((p, i) => (
              <FadeIn
                key={p.key}
                className="flex flex-col"
                delayClass={STAGGER[i * 80]}
              >
                <div className="bg-white rounded-2xl border border-gray-100 shadow-xs hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col h-full">
                  <div className="p-5 flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <UniLogo name={p.uni} website={p.website} size="md" />
                      {p.badge && (
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${BADGE_STYLES[p.badge]}`}>
                          {p.badge}
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-gray-900 leading-snug mb-1">
                      {p.course}
                    </h3>
                    <p className="text-sm text-gray-500 mb-3">{p.uni}</p>
                    <div className="flex items-center gap-1 text-gray-400 text-xs mb-3">
                      <MapPin className="w-3 h-3" />
                      <CountryFlagImg
                        name={p.country}
                        flag={p.flag}
                        sizeCls="w-4 h-3"
                        rounded="rounded-xs"
                        quality="w40"
                      />
                      {p.city}, {p.country}
                    </div>
                    <div className="flex gap-2 text-xs text-gray-500 flex-wrap">
                      <span className="bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-100">
                        {p.level}
                      </span>
                      <span className="bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-100">
                        {p.duration}
                      </span>
                      {p.field !== "Other" && (() => {
                        const CourseIcon = getCourseIcon(p.course);
                        const styles = COURSE_PILL_STYLES[p.field] || COURSE_PILL_STYLES["Other"];
                        return (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-medium ${styles.pill}`}
                          >
                            <CourseIcon className="w-3 h-3" aria-hidden="true" />
                            {p.field}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="px-5 pb-5 pt-4 border-t border-gray-50 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400">{p.feeIsAverage ? "Avg. tuition / year" : "Tuition / year"}</p>
                      <p className="font-bold text-gray-900 text-sm">{p.fee}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleApply}
                      className="bg-[#0d1b4b] text-white text-sm font-semibold px-5 py-2 rounded-xl hover:bg-[#152258] active:scale-95 transition-all inline-flex items-center gap-1.5"
                    >
                      <Zap className="w-3.5 h-3.5" /> Apply Now
                    </button>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn className="text-center mt-10" delayClass="delay-200">
            <Link
              to="/universities"
              className="inline-flex items-center gap-2 border-2 border-[#1740d9] text-blue-500 font-semibold px-8 py-3 rounded-xl hover:bg-blue-600 hover:text-white active:scale-95 transition-all"
            >
              Browse All Programs <ArrowRight className="w-4 h-4" />
            </Link>
          </FadeIn>
        </div>
      </section>

      {/* ── PARTNER UNIVERSITIES ── */}
      <section className="py-20 bg-[#eef2ff]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="flex items-end justify-between mb-10">
            <div>
              <span className="inline-block bg-blue-100 text-blue-500 text-xs font-semibold px-3 py-1 rounded-full mb-3 uppercase tracking-wide">Our Partners</span>
              <h2 className="text-3xl font-bold text-gray-900">
                Partner Universities
              </h2>
              <p className="text-gray-500 mt-2">
                Top-ranked institutions from around the world
              </p>
            </div>
            <Link
              to="/universities"
              className="hidden md:flex items-center gap-1 text-[#0d1b4b] font-medium hover:text-[#1a2d6e] text-sm"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </FadeIn>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {universities.map((u: any, i: number) => (
              <FadeIn key={u.id} delayClass={STAGGER[i * 60]}>
                <Link
                  to={`/university/${u.id}`}
                  className="block bg-white rounded-2xl p-5 border border-blue-100 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group text-center"
                >
                  <UniLogo
                    name={u.name}
                    website={u.website}
                    size="lg"
                    className="mx-auto mb-3 group-hover:scale-110 transition-all duration-300"
                  />
                  <p className="font-semibold text-gray-900 text-sm leading-snug group-hover:text-[#0d1b4b] transition-colors line-clamp-2">
                    {u.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-1 flex items-center justify-center gap-1">
                    <CountryFlagImg name={u.country} flag={FLAGS[u.country] || ""} sizeCls="w-4 h-3" rounded="rounded-xs" quality="w40" />
                    {[u.city, u.country].filter(Boolean).join(", ")}
                  </p>
                  {u.ranking ? (
                    <p className="text-xs text-blue-500 font-medium mt-2">#{u.ranking} World</p>
                  ) : null}
                  <p className="text-xs text-gray-400">
                    <BookOpen className="w-3 h-3 inline mr-0.5" />
                    {(u.courses || []).length} programs
                  </p>
                </Link>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── STUDY DESTINATIONS ── */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="text-center mb-12">
            <span className="inline-block bg-blue-50 text-blue-500 text-xs font-semibold px-3 py-1 rounded-full mb-3 uppercase tracking-wide">Destinations</span>
            <h2 className="text-3xl font-bold text-gray-900">
              Top Study Destinations
            </h2>
            <p className="text-gray-500 mt-2">
              Choose your dream country and explore available programs
            </p>
          </FadeIn>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {DESTINATIONS.map((d, i) => (
              <FadeIn key={d.country} delayClass={STAGGER[i * 60]}>
                <Link
                  to={`/search?country=${encodeURIComponent(d.country)}`}
                  className="block bg-white rounded-2xl p-5 text-center border border-white hover:border-[#0d1b4b]/20 hover:shadow-md hover:-translate-y-1 transition-all duration-300 group relative"
                >
                  <div className="mb-3 flex justify-center group-hover:scale-110 transition-transform duration-300">
                    <CountryFlagImg
                      name={d.country}
                      flag={FLAGS[d.country] || ""}
                      sizeCls="w-20 h-14"
                      rounded="rounded-xl"
                      className="shadow-md"
                      quality="w80"
                    />
                  </div>
                  <p className="font-semibold text-gray-900 text-sm group-hover:text-[#0d1b4b] transition-colors">
                    {d.country}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{d.note || "Explore programs →"}</p>
                </Link>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="py-20 bg-[#eef2ff]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="text-center mb-14">
            <span className="inline-block bg-blue-100 text-blue-500 text-xs font-semibold px-3 py-1 rounded-full mb-3 uppercase tracking-wide">Simple Process</span>
            <h2 className="text-3xl font-bold text-gray-900">How It Works</h2>
            <p className="text-gray-500 mt-2">
              Six simple steps to your dream university abroad
            </p>
          </FadeIn>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {STEPS.map((s, i) => (
              <FadeIn
                key={s.num}
                delayClass={STAGGER[i * 90]}
                className="flex gap-4 group"
              >
                <div className="shrink-0 w-11 h-11 bg-blue-500 text-white rounded-xl flex items-center justify-center font-bold shadow-xs shadow-blue-800/30 group-hover:scale-110 group-hover:bg-blue-600 transition-all duration-300">
                  {s.num}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{s.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              </FadeIn>
            ))}
          </div>
          <FadeIn className="text-center mt-12" delayClass="delay-300">
            <button
              type="button"
              onClick={() => open("register")}
              className="bg-blue-500 text-white font-semibold px-8 py-3.5 rounded-xl hover:bg-blue-600 active:scale-95 transition-all inline-flex items-center gap-2"
            >
              <Rocket className="w-4 h-4" /> Start Free Today{" "}
              <ChevronRight className="w-4 h-4" />
            </button>
          </FadeIn>
        </div>
      </section>

      {/* ── APPLICATION TRACKER ── */}
      <section className="py-20 bg-[#f8faff]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <FadeIn direction="left">
              <span className="inline-block bg-blue-100 text-blue-500 text-xs font-semibold px-3 py-1 rounded-full mb-4 uppercase tracking-wide">
                Real-time Tracking
              </span>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Know Exactly Where Every Application Stands
              </h2>
              <p className="text-gray-500 text-lg mb-6 leading-relaxed">
                Track every application from document submission to final acceptance — all in one place. Never miss a deadline again.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (isAuthenticated && user?.role === "student")
                    navigate("/student/applications");
                  else open("register");
                }}
                className="inline-flex items-center gap-2 bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-blue-600 active:scale-95 transition-all"
              >
                <Activity className="w-4 h-4" /> Start Tracking Free{" "}
                <ArrowRight className="w-4 h-4" />
              </button>
            </FadeIn>
            <FadeIn direction="right">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-6 space-y-4" aria-label="Example dashboard">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                  <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" /> Example dashboard · illustrative data
                </p>
                {TRACKER_DEMO.map((item, i) => (
                  <div
                    key={i}
                    className="p-4 bg-gray-50 rounded-xl hover:bg-sky-50 transition-colors duration-200"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-start gap-2.5">
                        <UniLogo name={item.uni} className="mt-0.5" />
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <CountryFlagImg
                              name={item.country}
                              flag={item.flag}
                              sizeCls="w-5 h-3.5"
                              rounded="rounded-xs"
                              quality="w40"
                            />
                            <p className="font-semibold text-gray-900 text-sm">
                              {item.uni}
                            </p>
                          </div>
                          <p className="text-xs text-gray-500">{item.course}</p>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ml-2 ${item.statusCls}`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                      <div
                        className={`bg-blue-500 h-1.5 rounded-full transition-all duration-1000 ${progressWidth(item.progress)}`}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {item.progress}% complete
                    </p>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-20 bg-[#f8faff]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="text-center mb-12">
            <span className="inline-block bg-yellow-50 text-yellow-700 text-xs font-semibold px-3 py-1 rounded-full mb-3 uppercase tracking-wide">Student Stories</span>
            <h2 className="text-3xl font-bold text-gray-900">
              What Our Students Say
            </h2>
            <p className="text-gray-500 mt-2">
              Stories from students who achieved their dream abroad with {BRAND}
            </p>
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <FadeIn
                key={t.name}
                delayClass={STAGGER[i * 80]}
                className="flex flex-col"
              >
                <div className="bg-white rounded-2xl p-6 border border-[#0d1b4b]/10 flex flex-col h-full hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                  <div className="flex gap-0.5 mb-3">
                    {[...Array(5)].map((_, j) => (
                      <Star
                        key={j}
                        className={`w-4 h-4 ${j < t.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
                      />
                    ))}
                  </div>
                  <p className="text-gray-700 leading-relaxed mb-5 italic flex-1">
                    "{t.text}"
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                      {t.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">
                        {t.name}
                      </p>
                      <p className="text-xs text-gray-500">{t.from}</p>
                      <p className="text-xs text-blue-500 font-medium mt-0.5">
                        → {t.uni}
                      </p>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── MEET OUR TEAM ── */}
      <section className="py-20 bg-[#f8faff]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="text-center mb-12">
            <span className="inline-block bg-blue-100 text-blue-700 text-sm font-medium px-3 py-1 rounded-full mb-4">
              Our Team
            </span>
            <h2 className="text-3xl font-bold text-gray-900">
              Meet Your Counselors
            </h2>
            <p className="text-gray-500 mt-3">
              Experienced advisors dedicated to your success abroad
            </p>
          </FadeIn>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {TEAM.map((member, i) => (
              <FadeIn key={member.name} delayClass={STAGGER[i * 80]}>
                <div className="bg-white rounded-2xl p-6 border border-blue-100 text-center hover:border-blue-300 hover:shadow-md hover:-translate-y-1 transition-all duration-300 group">
                  <div className="w-28 h-28 rounded-2xl overflow-hidden mx-auto mb-4 border-4 border-blue-50 shadow-md group-hover:scale-105 transition-transform duration-300">
                    {member.photo ? (
                      <img src={member.photo} alt={member.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-linear-to-br from-[#0d1b4b] to-blue-600 flex items-center justify-center text-white text-3xl font-bold font-display" aria-hidden="true">
                        {member.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                      </div>
                    )}
                  </div>
                  <h3 className="font-bold text-gray-900">{member.name}</h3>
                  <p className="text-blue-500 text-sm font-medium mt-0.5">
                    {member.role}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {member.exp} experience
                  </p>
                  <span className="inline-block mt-3 bg-blue-50 text-blue-500 text-xs px-3 py-1 rounded-full font-medium border border-blue-100">
                    {member.specialization}
                  </span>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <FadeIn className="text-center mb-12">
            <span className="inline-block bg-blue-100 text-blue-700 text-sm font-medium px-3 py-1 rounded-full mb-4">
              FAQ
            </span>
            <h2 className="text-3xl font-bold text-gray-900">
              Frequently Asked Questions
            </h2>
            <p className="text-gray-500 mt-3">
              Everything students ask before starting their study abroad journey
            </p>
          </FadeIn>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <FadeIn key={i} delayClass={STAGGER[Math.min(i * 60, 450)]}>
                <div
                  className={`border rounded-2xl overflow-hidden transition-all duration-300 ${openFaq === i ? "border-blue-400 shadow-md" : "border-gray-200 hover:border-blue-200 hover:shadow-xs"}`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left bg-white hover:bg-blue-50 active:bg-blue-50 transition-colors"
                  >
                    <span
                      className={`font-semibold transition-colors ${openFaq === i ? "text-blue-500" : "text-gray-900"}`}
                    >
                      {faq.q}
                    </span>
                    <ChevronDown
                      className={`w-5 h-5 text-blue-500 shrink-0 transition-transform duration-300 ${openFaq === i ? "rotate-180" : ""}`}
                    />
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${openFaq === i ? "max-h-48" : "max-h-0"}`}
                  >
                    <p className="px-6 pb-5 pt-1 text-gray-600 leading-relaxed border-t border-blue-100">
                      {faq.a}
                    </p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
          <FadeIn className="text-center mt-10" delayClass="delay-200">
            <p className="text-gray-500 text-sm">
              Still have questions?{" "}
              <button
                type="button"
                onClick={() => open("register")}
                className="text-[#0d1b4b] font-semibold hover:text-blue-500 transition-colors"
              >
                Talk to a counselor for free →
              </button>
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER CTA ── */}
      <section id="talk-to-advisor" className="bg-linear-to-br from-[#0d1b4b] to-[#1a3a8a] py-20 text-white scroll-mt-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <FadeIn>
            <h2 className="text-4xl font-bold mb-4">
              Your Future is Global — Start Today
            </h2>
            <p className="text-blue-100 text-lg mb-8">
              Find your university with {BRAND}. Free guidance, every step of the way.
            </p>
          </FadeIn>
          <FadeIn
            delayClass="delay-120"
            className="flex flex-col sm:flex-row gap-4 justify-center mb-10"
          >
            <button
              type="button"
              onClick={() => open("register")}
              className="bg-blue-500 hover:bg-blue-400 text-white font-bold px-8 py-4 rounded-xl active:scale-95 transition-all inline-flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30"
            >
              <Rocket className="w-4 h-4" /> Register for Free
            </button>
            <Link
              to="/universities"
              className="border-2 border-white/40 text-white font-semibold px-8 py-4 rounded-xl hover:bg-white/10 active:scale-95 transition-all inline-flex items-center justify-center gap-2"
            >
              <BookOpen className="w-4 h-4" /> Browse Programs{" "}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </FadeIn>
          <FadeIn delayClass="delay-200">
            <h3 className="text-white font-semibold text-lg mb-1">Talk to an advisor</h3>
            <p className="text-blue-200 text-sm mb-3">
              Leave your details and a counselor will get in touch — free, no obligation.
            </p>
            {subscribed ? (
              <p className="text-white font-medium">
                Thanks for registering! Our team will be in touch soon.
              </p>
            ) : (
              <div className="max-w-md mx-auto space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={subName}
                    onChange={(e) => {
                      setSubName(e.target.value);
                      setSubError("");
                    }}
                    placeholder="Your name" aria-label="Your name" autoComplete="name"
                    disabled={subLoading}
                    className="flex-1 px-4 py-2.5 rounded-xl text-gray-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-white disabled:opacity-60"
                  />
                  <input
                    type="tel"
                    value={subPhone}
                    onChange={(e) => {
                      setSubPhone(e.target.value);
                      setSubError("");
                    }}
                    placeholder="Phone number" aria-label="Phone number" autoComplete="tel"
                    disabled={subLoading}
                    className="flex-1 px-4 py-2.5 rounded-xl text-gray-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-white disabled:opacity-60"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setSubError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleSubscribe()}
                    placeholder="Your email address" aria-label="Email address" autoComplete="email"
                    disabled={subLoading}
                    className="flex-1 px-4 py-2.5 rounded-xl text-gray-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-white disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={handleSubscribe}
                    disabled={subLoading}
                    className="bg-blue-500 hover:bg-blue-400 text-white font-semibold px-5 py-2.5 rounded-xl active:scale-95 transition-all whitespace-nowrap text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <Mail className="w-3.5 h-3.5" />{" "}
                    {subLoading ? "Submitting…" : "Register Free"}
                  </button>
                </div>
                {subError && (
                  <p className="text-red-300 text-xs mt-2">{subError}</p>
                )}
              </div>
            )}
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-gray-900 text-gray-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
            <div>
              <div className="flex items-center mb-4">
                <div className="w-9 h-9 bg-[#0d1b4b] rounded-xl flex items-center justify-center shrink-0">
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-extrabold tracking-tight select-none ml-2">
                  <span className="text-white">Grad</span><span className="text-blue-400">zest</span>
                </span>
              </div>
              <p className="text-sm leading-relaxed mb-4">
                Empowering Indian students to discover, apply, and thrive at top
                universities worldwide with expert counseling.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Students</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link
                    to="/universities"
                    className="hover:text-white transition-colors"
                  >
                    Browse Programs
                  </Link>
                </li>
                <li>
                  <Link
                    to="/resources"
                    className="hover:text-white transition-colors"
                  >
                    Blog &amp; Resources
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() =>
                      isAuthenticated && user?.role === "student"
                        ? navigate("/student/applications")
                        : open("login")
                    }
                    className="hover:text-white transition-colors"
                  >
                    My Applications
                  </button>
                </li>
                <li>
                  <Link
                    to="/search"
                    className="hover:text-white transition-colors"
                  >
                    Scholarships
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => open("register")}
                    className="hover:text-white transition-colors"
                  >
                    Visa Guides
                  </button>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Destinations</h4>
              <ul className="space-y-2 text-sm">
                {[
                  "United States",
                  "United Kingdom",
                  "Canada",
                  "Australia",
                  "Germany",
                ].map((c) => (
                  <li key={c}>
                    <Link
                      to={`/search?country=${encodeURIComponent(c)}`}
                      className="hover:text-white transition-colors"
                    >
                      {c}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/#about" className="hover:text-white transition-colors">
                    About Us
                  </Link>
                </li>
                <li>
                  <Link to="/#talk-to-advisor" className="hover:text-white transition-colors">
                    Talk to an Advisor
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:text-white transition-colors">
                    Terms of Use
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-sm">
            <p>© {new Date().getFullYear()} {BRAND}. All rights reserved.</p>
            <p className="flex items-center gap-4">
              <span>SSL Secured</span>
              <Link to="/privacy" className="hover:text-white transition-colors">GDPR Compliant</Link>
              <span>Free to Apply</span>
            </p>
          </div>
        </div>
      </footer>

      <DetailModal
        modal={detailModal}
        onClose={() => setDetailModal(null)}
        universities={universities}
        allPrograms={allPrograms}
        navigate={navigate}
      />
    </div>
  );
}
