import type { Demos } from "../../gallery/types.ts";
import BaseInputs from "./base-inputs.tsx";
import baseInputs from "./base-inputs.tsx?raw";
import ChoiceCards from "./choice-cards.tsx";
import choiceCards from "./choice-cards.tsx?raw";
import Colors from "./color.tsx";
import color from "./color.tsx?raw";
import DateRanges from "./date-range.tsx";
import dateRange from "./date-range.tsx?raw";
import NumberFields from "./number-fields.tsx";
import numberFields from "./number-fields.tsx?raw";
import OtpAndDate from "./otp-date.tsx";
import otpDate from "./otp-date.tsx?raw";
import Phones from "./phone.tsx";
import phone from "./phone.tsx?raw";
import RangeAndRating from "./range-rating.tsx";
import rangeRating from "./range-rating.tsx?raw";
import Tags from "./tags.tsx";
import tags from "./tags.tsx?raw";
import Times from "./time.tsx";
import time from "./time.tsx?raw";
import Uploads from "./upload.tsx";
import upload from "./upload.tsx?raw";

export const demos: Demos = {
  "base-inputs": { component: BaseInputs, code: baseInputs },
  tags: { component: Tags, code: tags },
  "number-fields": { component: NumberFields, code: numberFields },
  phone: { component: Phones, code: phone },
  time: { component: Times, code: time },
  "date-range": { component: DateRanges, code: dateRange },
  "otp-date": { component: OtpAndDate, code: otpDate },
  color: { component: Colors, code: color },
  "range-rating": { component: RangeAndRating, code: rangeRating },
  "choice-cards": { component: ChoiceCards, code: choiceCards },
  upload: { component: Uploads, code: upload },
};
