/**
 * 404 Not Found Page
 */

import { Link } from "react-router-dom";
import { Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useTranslationStore } from "@/stores/useTranslationStore";

// Animated SVG cloud with a floating plane
function AnimatedCloudPlane() {
  return (
    <div className="relative flex justify-center items-center w-full h-40 mb-6">
      <svg
        width="220"
        height="80"
        viewBox="0 0 220 80"
        fill="none"
        className="absolute left-1/2 -translate-x-1/2 top-0"
      >
        <ellipse
          cx="110"
          cy="60"
          rx="100"
          ry="18"
          fill="#e0e7ef"
          fillOpacity="0.7"
        />
        <ellipse
          cx="60"
          cy="70"
          rx="30"
          ry="10"
          fill="#e0e7ef"
          fillOpacity="0.5"
        />
        <ellipse
          cx="170"
          cy="70"
          rx="25"
          ry="8"
          fill="#e0e7ef"
          fillOpacity="0.5"
        />
      </svg>
      <motion.svg
        width="60"
        height="32"
        viewBox="0 0 60 32"
        fill="none"
        className="z-10"
        initial={{ y: 0 }}
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <rect x="10" y="14" width="40" height="6" rx="3" fill="#64748b" />
        <polygon points="50,17 60,16 50,20" fill="#64748b" />
        <rect x="5" y="16" width="8" height="2" rx="1" fill="#64748b" />
        <ellipse cx="30" cy="17" rx="7" ry="7" fill="#cbd5e1" />
        <ellipse cx="30" cy="17" rx="4" ry="4" fill="#f1f5f9" />
      </motion.svg>
    </div>
  );
}

export default function NotFound() {
  const { t } = useTranslationStore();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-blue-50 dark:to-slate-900">
      <motion.div
        className="bg-white/80 dark:bg-slate-900/80 rounded-3xl shadow-2xl p-10 md:p-16 flex flex-col items-center max-w-lg w-full border border-primary/10 backdrop-blur-lg"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <AnimatedCloudPlane />
        <motion.h1
          className="text-[7rem] md:text-[9rem] font-extrabold text-primary/30 leading-none mb-2 select-none"
          initial={{ scale: 1 }}
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        >
          404
        </motion.h1>
        <motion.h2
          className="text-2xl font-semibold mb-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7 }}
        >
          {t("notFound.title")}
        </motion.h2>
        <motion.p
          className="text-muted-foreground max-w-md mx-auto mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.7 }}
        >
          {t("notFound.message")}
          <br />
          {t("notFound.backOnTrack")}
        </motion.p>
        <div className="flex items-center justify-center gap-4 w-full">
          <Button variant="outline" asChild className="w-32">
            <Link to="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("notFound.goHome")}
            </Link>
          </Button>
          <Button asChild className="w-32">
            <Link to="/dashboard">
              <Home className="h-4 w-4 mr-2" />
              {t("notFound.dashboard")}
            </Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
