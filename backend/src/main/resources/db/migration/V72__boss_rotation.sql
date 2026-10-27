CREATE TABLE boss_rotation (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    slots JSONB NOT NULL CHECK (jsonb_typeof(slots) = 'array'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by BIGINT REFERENCES member(id)
);

-- Initial daily schedule supplied by the guild; times are America/Sao_Paulo.
INSERT INTO boss_rotation (id, slots) VALUES (1, $rotation$[
  {
    "time": "02:00",
    "qg": [
      {
        "guild": "Quit",
        "bosses": [
          "Warbeast",
          "Splinter"
        ]
      },
      {
        "guild": "Devotion",
        "bosses": [
          "Beach (Vafer)"
        ]
      },
      {
        "guild": "Yonkou",
        "bosses": [
          "Ratmoth"
        ]
      }
    ],
    "outpost": [
      {
        "guild": "Blacklist",
        "bosses": [
          "Blood King Twizer",
          "Rex Cannibal (Rhino)"
        ]
      },
      {
        "guild": "Espada",
        "bosses": [
          "Blood Vafer Rex"
        ]
      },
      {
        "guild": "Devotion",
        "bosses": [
          "Heavy Anabola"
        ]
      },
      {
        "guild": "Energy",
        "bosses": [
          "RashVafer Luther",
          "Brutal Rex (Mantis)",
          "Great Lava"
        ]
      },
      {
        "guild": "Quit",
        "bosses": [
          "Twizer Rex"
        ]
      }
    ]
  },
  {
    "time": "06:00",
    "qg": [
      {
        "guild": "Quit",
        "bosses": [
          "Warbeast",
          "Splinter",
          "Beach (Vafer)"
        ]
      },
      {
        "guild": "Devotion",
        "bosses": [
          "Ratmoth"
        ]
      }
    ],
    "outpost": []
  },
  {
    "time": "10:00",
    "qg": [
      {
        "guild": "Devotion",
        "bosses": [
          "Warbeast",
          "Splinter"
        ]
      },
      {
        "guild": "Yonkou",
        "bosses": [
          "Ratmoth",
          "Beach (Vafer)"
        ]
      }
    ],
    "outpost": [
      {
        "guild": "Energy",
        "bosses": [
          "RashVafer Luther",
          "Blood Vafer Rex",
          "Blood King Twizer"
        ]
      },
      {
        "guild": "Yonkou",
        "bosses": [
          "Great Lava"
        ]
      },
      {
        "guild": "Espada",
        "bosses": [
          "Rex Cannibal (Rhino)",
          "Twizer Rex",
          "Heavy Anabola",
          "Brutal Rex (Mantis)"
        ]
      }
    ]
  },
  {
    "time": "14:00",
    "qg": [
      {
        "guild": "Blacklist",
        "bosses": [
          "Ratmoth",
          "Beach (Vafer)"
        ]
      },
      {
        "guild": "Yonkou",
        "bosses": [
          "Warbeast",
          "Splinter"
        ]
      }
    ],
    "outpost": []
  },
  {
    "time": "18:00",
    "qg": [
      {
        "guild": "Blacklist",
        "bosses": [
          "Splinter"
        ]
      },
      {
        "guild": "Devotion",
        "bosses": [
          "Warbeast",
          "Beach (Vafer)"
        ]
      },
      {
        "guild": "Yonkou",
        "bosses": [
          "Ratmoth"
        ]
      }
    ],
    "outpost": [
      {
        "guild": "Blacklist",
        "bosses": [
          "Rex Cannibal (Rhino)"
        ]
      },
      {
        "guild": "Devotion",
        "bosses": [
          "RashVafer Luther",
          "Blood Vafer Rex"
        ]
      },
      {
        "guild": "Quit",
        "bosses": [
          "Blood King Twizer",
          "Brutal Rex (Mantis)",
          "Twizer Rex"
        ]
      },
      {
        "guild": "Yonkou",
        "bosses": [
          "Heavy Anabola",
          "Great Lava"
        ]
      }
    ]
  },
  {
    "time": "22:00",
    "qg": [
      {
        "guild": "Blacklist",
        "bosses": [
          "Warbeast",
          "Splinter",
          "Ratmoth"
        ]
      },
      {
        "guild": "Quit",
        "bosses": [
          "Beach (Vafer)"
        ]
      }
    ],
    "outpost": []
  }
]$rotation$::jsonb);
