// VideoContext.js
import React, { createContext, useContext, useRef } from 'react';

const VideoContext = createContext();

export const VideoProvider = ({ children }) => {
  const videoRef = useRef(null);

  return (
    <VideoContext.Provider value={videoRef}>
      {children}
    </VideoContext.Provider>
  );
};

export const useVideo = () => {
  return useContext(VideoContext);
};