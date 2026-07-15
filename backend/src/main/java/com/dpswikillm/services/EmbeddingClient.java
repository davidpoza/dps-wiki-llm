package com.dpswikillm.services;

import java.util.List;

public interface EmbeddingClient {
    List<float[]> embedPassages(List<String> texts);

    float[] embedQuery(String text);
}
