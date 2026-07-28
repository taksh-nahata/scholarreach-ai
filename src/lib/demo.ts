import demo from "../../public/demo-data.json";

export type DemoBundle = typeof demo;

export function getDemoBundle(): DemoBundle {
  return demo;
}
