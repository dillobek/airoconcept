import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { RequireAuth } from "./auth";
import { Layout } from "./components/Layout";
import "./index.css";
import { ApiKeys } from "./pages/ApiKeys";
import { Finance } from "./pages/Finance";
import { LeadDetail } from "./pages/LeadDetail";
import { Leads } from "./pages/Leads";
import { Login } from "./pages/Login";
import { Security } from "./pages/Security";
import { Users } from "./pages/Users";

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/leads" element={<Leads />} />
            <Route path="/leads/:id" element={<LeadDetail />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/users" element={<Users />} />
            <Route path="/api-keys" element={<ApiKeys />} />
            <Route path="/security" element={<Security />} />
          </Route>
          <Route path="*" element={<Navigate to="/leads" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
