import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Award, CheckCircle2, Search, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import PageLoader from "@/components/ui/page-loader";
import learningDevelopmentAPI from "@/lib/api/learningDevelopment";

const resolveDownloadUrl = (value: string | null | undefined) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
  return value.startsWith("/") ? `${baseUrl}${value}` : `${baseUrl}/${value}`;
};

export default function CertificateVerification() {
  const navigate = useNavigate();
  const params = useParams<{ verificationCode?: string }>();
  const routeCode = String(params.verificationCode || "").trim().toUpperCase();
  const [searchCode, setSearchCode] = useState(routeCode);

  useEffect(() => {
    setSearchCode(routeCode);
  }, [routeCode]);

  const {
    data: verification,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["certificate-verification", routeCode],
    enabled: Boolean(routeCode),
    retry: false,
    queryFn: () => learningDevelopmentAPI.verifyCertificate(routeCode),
  });

  const downloadUrl = resolveDownloadUrl(verification?.downloadUrl);

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white">
            <Award className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Certificate Verification</h1>
          <p className="mt-2 text-sm text-slate-600">
            Enter a verification code to confirm whether a training certificate is valid.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lookup Certificate</CardTitle>
            <CardDescription>
              Verification codes are printed on the certificate itself.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                const normalized = searchCode.trim().toUpperCase();
                if (!normalized) return;
                navigate(`/certificates/verify/${encodeURIComponent(normalized)}`);
              }}
            >
              <Input
                value={searchCode}
                onChange={(event) => setSearchCode(event.target.value.toUpperCase())}
                placeholder="Enter verification code"
              />
              <Button type="submit">
                <Search className="mr-2 h-4 w-4" />
                Verify
              </Button>
            </form>
          </CardContent>
        </Card>

        {!routeCode ? null : isLoading ? (
          <Card>
            <CardContent className="py-10">
              <PageLoader message="Checking certificate..." minHeightClassName="min-h-[180px]" />
            </CardContent>
          </Card>
        ) : isError ? (
          <Card className="border-red-200">
            <CardContent className="flex items-start gap-3 py-6 text-red-900">
              <ShieldAlert className="mt-0.5 h-5 w-5" />
              <div>
                <p className="font-semibold">Certificate not found</p>
                <p className="mt-1 text-sm text-red-700">
                  {(error as Error)?.message || "The verification code could not be matched."}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : verification ? (
          <Card className={verification.valid ? "border-emerald-200" : "border-amber-200"}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Verification Result</CardTitle>
                  <CardDescription>
                    {verification.certificateNumber || "Certificate"}
                  </CardDescription>
                </div>
                <Badge className={verification.valid ? "bg-emerald-600" : "bg-amber-600"}>
                  {verification.valid ? "Valid" : "Not valid"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    className={`mt-0.5 h-5 w-5 ${verification.valid ? "text-emerald-600" : "text-amber-600"}`}
                  />
                  <div>
                    <p className="font-semibold text-slate-900">
                      {verification.valid
                        ? "This certificate is currently valid."
                        : verification.status === "revoked"
                          ? "This certificate has been revoked."
                          : "This certificate is not valid."}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Verification code: {verification.verificationCode || routeCode}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-slate-500">Learner</p>
                  <p className="font-medium text-slate-900">
                    {verification.learner?.name || "Not available"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Training</p>
                  <p className="font-medium text-slate-900">
                    {verification.training?.name || "Not available"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Issued By</p>
                  <p className="font-medium text-slate-900">
                    {verification.issuedBy || "Internal"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Issued On</p>
                  <p className="font-medium text-slate-900">
                    {verification.issuedAt
                      ? new Date(verification.issuedAt).toLocaleDateString()
                      : "Not available"}
                  </p>
                </div>
              </div>

              {downloadUrl && (
                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                      Open Certificate PDF
                    </a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
