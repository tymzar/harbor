import React from "react";
import "../../assets/css/index.css";
import { HeroUIProvider, ToastProvider } from "@heroui/react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";

type ApplicationRootProperties = {
  children: React.ReactNode;
};

// Legend
Chart.register(
  Legend,
  ArcElement,
  Tooltip,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  PointElement,
  LineElement
);

export function PageRoot({ children }: ApplicationRootProperties): JSX.Element {
  return (
    <HeroUIProvider>
      <ToastProvider />
      <div className="min-h-screen w-full bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="flex justify-center w-full">
          <div className="grid grid-cols-12 gap-4 w-full max-w-none">
            <div className="col-start-2 col-end-12">{children}</div>
          </div>
        </div>
      </div>
    </HeroUIProvider>
  );
}
