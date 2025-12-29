"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

type CSVRow = {
  email: string;
  phone_number: string;
  name: string;
  birth_date?: string;
  address?: string;
};

type UploadResult = {
  success: boolean;
  created: number;
  skipped: number;
  failed: number;
  errors: Array<{
    row: number;
    email: string;
    reason: string;
  }>;
};

type UploadStage = "upload" | "preview" | "uploading" | "result";

export default function BulkUploadPage() {
  const [stage, setStage] = useState<UploadStage>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<CSVRow[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parseCSV = (text: string): CSVRow[] => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const rows: CSVRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());
      const row: CSVRow = {
        email: "",
        phone_number: "",
        name: "",
      };

      headers.forEach((header, index) => {
        const value = values[index] || "";
        if (header === "email") row.email = value;
        else if (header === "phone_number" || header === "phone") row.phone_number = value;
        else if (header === "name") row.name = value;
        else if (header === "birth_date" || header === "birthdate") row.birth_date = value;
        else if (header === "address") row.address = value;
      });

      if (row.email || row.phone_number || row.name) {
        rows.push(row);
      }
    }

    return rows;
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const csvFile = acceptedFiles[0];
    if (!csvFile) return;

    setFile(csvFile);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const rows = parseCSV(text);

        if (rows.length === 0) {
          setError("CSV 파일에 유효한 데이터가 없습니다.");
          return;
        }

        setPreviewData(rows);
        setStage("preview");
      } catch {
        setError("CSV 파일 파싱에 실패했습니다.");
      }
    };
    reader.onerror = () => {
      setError("파일을 읽는 중 오류가 발생했습니다.");
    };
    reader.readAsText(csvFile);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".csv"],
    },
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (!file) return;

    setStage("uploading");
    setUploadProgress(10);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // 진행률 시뮬레이션
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 500);

      const response = await fetch(`${API_BASE}/v1/admin/wards/bulk-upload`, {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setResult({
        success: true,
        created: data.created || 0,
        skipped: data.skipped || 0,
        failed: data.failed || 0,
        errors: data.errors || [],
      });
      setStage("result");
    } catch (err) {
      setError((err as Error).message);
      setStage("preview");
    }
  };

  const handleReset = () => {
    setStage("upload");
    setFile(null);
    setPreviewData([]);
    setUploadProgress(0);
    setResult(null);
    setError(null);
  };

  const downloadSampleCSV = () => {
    const sample = `email,phone_number,name,birth_date,address
ward1@example.com,010-1234-5678,김영희,1950-03-15,서울시 강남구
ward2@example.com,010-2345-6789,박철수,1948-07-22,부산시 해운대구
ward3@example.com,010-3456-7890,이순자,1952-11-08,대구시 수성구`;

    const blob = new Blob([sample], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sample_wards.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadErrorsCSV = () => {
    if (!result || result.errors.length === 0) return;

    const header = "row,email,reason\n";
    const rows = result.errors
      .map((e) => `${e.row},"${e.email}","${e.reason}"`)
      .join("\n");

    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "upload_errors.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f3f4f6",
        fontFamily: "sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          backgroundColor: "white",
          borderBottom: "1px solid #e5e7eb",
          padding: "16px 24px",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "bold" }}>
          피보호자 일괄 등록
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#6b7280" }}>
          CSV 파일로 피보호자를 일괄 등록할 수 있습니다.
        </p>
      </header>

      <main style={{ padding: "24px", maxWidth: "800px", margin: "0 auto" }}>
        {/* Error Message */}
        {error && (
          <div
            style={{
              padding: "12px 16px",
              marginBottom: "24px",
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              color: "#dc2626",
              fontSize: "14px",
            }}
          >
            {error}
          </div>
        )}

        {/* Upload Stage */}
        {stage === "upload" && (
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "32px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <div
              {...getRootProps()}
              style={{
                border: `2px dashed ${isDragActive ? "#3b82f6" : "#d1d5db"}`,
                borderRadius: "12px",
                padding: "48px 24px",
                textAlign: "center",
                cursor: "pointer",
                backgroundColor: isDragActive ? "#eff6ff" : "#f9fafb",
                transition: "all 0.2s",
              }}
            >
              <input {...getInputProps()} />
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>📁</div>
              <p style={{ fontSize: "16px", color: "#374151", marginBottom: "8px" }}>
                {isDragActive
                  ? "파일을 놓으세요..."
                  : "파일을 드래그하거나 클릭하여 선택"}
              </p>
              <p style={{ fontSize: "14px", color: "#6b7280" }}>
                CSV 파일만 업로드 가능합니다
              </p>
            </div>

            <div style={{ marginTop: "24px", textAlign: "center" }}>
              <button
                onClick={downloadSampleCSV}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  backgroundColor: "white",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                  fontSize: "14px",
                  color: "#374151",
                  cursor: "pointer",
                }}
              >
                📥 샘플 CSV 다운로드
              </button>
            </div>

            <div
              style={{
                marginTop: "24px",
                padding: "16px",
                backgroundColor: "#f9fafb",
                borderRadius: "8px",
              }}
            >
              <p style={{ margin: 0, fontSize: "14px", fontWeight: "bold", color: "#374151" }}>
                CSV 형식
              </p>
              <code
                style={{
                  display: "block",
                  marginTop: "8px",
                  fontSize: "13px",
                  color: "#6b7280",
                }}
              >
                email, phone_number, name, birth_date, address
              </code>
            </div>
          </div>
        )}

        {/* Preview Stage */}
        {stage === "preview" && (
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              <span style={{ fontSize: "24px" }}>📄</span>
              <div>
                <p style={{ margin: 0, fontSize: "16px", fontWeight: "bold" }}>
                  {file?.name}
                </p>
                <p style={{ margin: 0, fontSize: "14px", color: "#6b7280" }}>
                  {previewData.length}명 감지됨
                </p>
              </div>
            </div>

            {/* Preview Table */}
            <div
              style={{
                overflow: "auto",
                maxHeight: "300px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "14px",
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: "#f9fafb" }}>
                    <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                      이메일
                    </th>
                    <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                      전화번호
                    </th>
                    <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                      이름
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      <td style={{ padding: "12px", borderBottom: "1px solid #f3f4f6" }}>
                        {row.email}
                      </td>
                      <td style={{ padding: "12px", borderBottom: "1px solid #f3f4f6" }}>
                        {row.phone_number}
                      </td>
                      <td style={{ padding: "12px", borderBottom: "1px solid #f3f4f6" }}>
                        {row.name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {previewData.length > 10 && (
              <p style={{ marginTop: "12px", fontSize: "14px", color: "#6b7280", textAlign: "center" }}>
                ... 외 {previewData.length - 10}명
              </p>
            )}

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
                marginTop: "24px",
              }}
            >
              <button
                onClick={handleReset}
                style={{
                  padding: "12px 24px",
                  backgroundColor: "white",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                  fontSize: "14px",
                  color: "#374151",
                  cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={handleUpload}
                style={{
                  padding: "12px 24px",
                  backgroundColor: "#3b82f6",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                업로드
              </button>
            </div>
          </div>
        )}

        {/* Uploading Stage */}
        {stage === "uploading" && (
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "48px 24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>⏳</div>
            <p style={{ fontSize: "16px", color: "#374151", marginBottom: "24px" }}>
              업로드 중...
            </p>

            {/* Progress Bar */}
            <div
              style={{
                width: "100%",
                maxWidth: "400px",
                height: "8px",
                backgroundColor: "#e5e7eb",
                borderRadius: "4px",
                margin: "0 auto",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${uploadProgress}%`,
                  height: "100%",
                  backgroundColor: "#3b82f6",
                  transition: "width 0.3s",
                }}
              />
            </div>
            <p style={{ marginTop: "12px", fontSize: "14px", color: "#6b7280" }}>
              {uploadProgress}%
            </p>
          </div>
        )}

        {/* Result Stage */}
        {stage === "result" && result && (
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "32px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>
                {result.failed === 0 ? "✅" : "⚠️"}
              </div>
              <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "bold" }}>
                업로드 완료
              </h2>
            </div>

            {/* Stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "16px",
                marginBottom: "24px",
              }}
            >
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#f0fdf4",
                  borderRadius: "8px",
                  textAlign: "center",
                }}
              >
                <p style={{ margin: 0, fontSize: "24px", fontWeight: "bold", color: "#22c55e" }}>
                  {result.created}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#6b7280" }}>
                  성공
                </p>
              </div>
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#fefce8",
                  borderRadius: "8px",
                  textAlign: "center",
                }}
              >
                <p style={{ margin: 0, fontSize: "24px", fontWeight: "bold", color: "#eab308" }}>
                  {result.skipped}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#6b7280" }}>
                  건너뜀
                </p>
              </div>
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#fef2f2",
                  borderRadius: "8px",
                  textAlign: "center",
                }}
              >
                <p style={{ margin: 0, fontSize: "24px", fontWeight: "bold", color: "#ef4444" }}>
                  {result.failed}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#6b7280" }}>
                  실패
                </p>
              </div>
            </div>

            {/* Error Details */}
            {result.errors.length > 0 && (
              <div
                style={{
                  marginBottom: "24px",
                  padding: "16px",
                  backgroundColor: "#fef2f2",
                  borderRadius: "8px",
                }}
              >
                <p style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: "bold", color: "#dc2626" }}>
                  실패 상세
                </p>
                <div style={{ maxHeight: "150px", overflow: "auto" }}>
                  {result.errors.slice(0, 10).map((err, i) => (
                    <p
                      key={i}
                      style={{
                        margin: "4px 0",
                        fontSize: "13px",
                        color: "#374151",
                      }}
                    >
                      - {err.row}행: {err.email} - {err.reason}
                    </p>
                  ))}
                  {result.errors.length > 10 && (
                    <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#6b7280" }}>
                      ... 외 {result.errors.length - 10}건
                    </p>
                  )}
                </div>

                <button
                  onClick={downloadErrorsCSV}
                  style={{
                    marginTop: "12px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 12px",
                    backgroundColor: "white",
                    border: "1px solid #fecaca",
                    borderRadius: "6px",
                    fontSize: "13px",
                    color: "#dc2626",
                    cursor: "pointer",
                  }}
                >
                  📥 실패 목록 다운로드
                </button>
              </div>
            )}

            {/* Done Button */}
            <div style={{ textAlign: "center" }}>
              <button
                onClick={handleReset}
                style={{
                  padding: "12px 32px",
                  backgroundColor: "#3b82f6",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                확인
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
