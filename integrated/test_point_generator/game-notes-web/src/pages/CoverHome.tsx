import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAppState } from "../context/AppStateContext";
export default function CoverHome() {
  const navigate = useNavigate();
  const { state, setCoverImage } = useAppState();
  const fileRef = useRef<HTMLInputElement>(null);
  const cover = state.preferences.home_cover_image;

  const onPickFile = (f: FileList | null) => {
    const file = f?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === "string") setCoverImage(r);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="cover-root"
      style={
        cover
          ? { backgroundImage: `url(${cover})` }
          : { background: "linear-gradient(145deg, #e8eef5 0%, #f5f7fa 50%, #dde7f3 100%)" }
      }
    >
      <div className="cover-scrim" />
      <button
        type="button"
        className="cover-change"
        onClick={() => fileRef.current?.click()}
      >
        更换封面
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="visually-hidden"
        onChange={(e) => onPickFile(e.target.files)}
      />
      <div className="cover-center">
        <button
          type="button"
          className="btn btn-primary cover-cta"
          onClick={() => navigate("/games")}
        >
          进入笔记
        </button>
      </div>
    </div>
  );
}
