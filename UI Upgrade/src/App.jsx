import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { pagesConfig } from "./pages.config";
import PageNotFound from "./lib/PageNotFound";
import { createPageUrl } from "@/utils";

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : null;

function LayoutWrapper({ children, currentPageName }) {
  if (Layout) {
    return <Layout currentPageName={currentPageName}>{children}</Layout>;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={<LayoutWrapper currentPageName={mainPageKey}>{MainPage ? <MainPage /> : null}</LayoutWrapper>}
        />
        {Object.entries(Pages).map(([path, Page]) => (
          <Route
            key={path}
            path={createPageUrl(path)}
            element={
              <LayoutWrapper currentPageName={path}>
                <Page />
              </LayoutWrapper>
            }
          />
        ))}
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Router>
  );
}
