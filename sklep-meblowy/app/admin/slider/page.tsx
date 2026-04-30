import { requireAdmin } from "@/app/_lib/admin";
import { getAllSlides } from "@/app/_lib/slides";
import SliderEditor from "./SliderEditor";

export const metadata = { title: "Slider — Admin" };

export default async function AdminSliderPage() {
  await requireAdmin();
  const slides = await getAllSlides();

  return <SliderEditor initialSlides={slides} />;
}
