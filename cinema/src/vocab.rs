//! The house vocabulary (ROTEIRO §0.4.8): what visitors may say to each other,
//! online (`write`) or to the next one (the notes in Cabin 0). Only these
//! words, 1 to 4 of them: nothing to moderate. The site has the same list
//! (src/cinema/vocab.ts).

pub const WORDS: &[&str] = &[
    // pt
    "olá", "oi", "obrigado", "boa sorte", "psiu", "tente", "siga", "a luz", "o projetor", "a cabine", "o bueiro", "a lua",
    "o beco", "o cofre", "o farol", "a chuva", "os créditos", "ao contrário", "segure", "espere", "não clique", "clique",
    "quem liga o projetor?", "48", "está perto", "continue", "volte", "no escuro", "devagar", "rápido",
    // en
    "hello", "hi", "thanks", "good luck", "shh", "try", "follow", "the light", "the projector", "the booth", "the manhole",
    "the moon", "the alley", "the vault", "the lighthouse", "the rain", "the credits", "backwards", "hold", "wait",
    "don't click", "click", "who turns the projector on?", "it's close", "keep going", "go back", "in the dark", "slowly",
    "quickly",
];

/// The words joined, if every one is in the vocabulary and there are 1 to 4.
pub fn sentence(words: &[String]) -> Option<String> {
    if words.is_empty() || words.len() > 4 || !words.iter().all(|w| WORDS.contains(&w.as_str())) {
        return None;
    }
    Some(words.join(" · "))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_house_vocabulary() {
        let w = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(sentence(&w(&["tente", "o bueiro"])).as_deref(), Some("tente · o bueiro"));
        assert!(sentence(&w(&["tente", "anything else"])).is_none());
        assert!(sentence(&w(&[])).is_none());
        assert!(sentence(&w(&["oi", "oi", "oi", "oi", "oi"])).is_none());
    }
}
