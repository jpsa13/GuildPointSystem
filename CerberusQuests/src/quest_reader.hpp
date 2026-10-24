#pragma once
#include <array>
#include <cstdint>
#include <cstring>
#include <cstdio>
#include <string>
#include <vector>
#include "quest_profile.hpp"

namespace QuestProbe {
using U32 = uint32_t;
constexpr U32 ManagerPointer = 0x023DB0E0;
constexpr U32 TargetCode = 0x10082000;

inline U32 Word(const unsigned char* bytes, size_t offset) {
    U32 value;
    std::memcpy(&value, bytes + offset, sizeof(value));
    return value;
}

struct Snapshot {
    // Unknown never means that the quest was removed or completed.
    std::string status = "UNKNOWN";
    int slot = -1;
    U32 flags = 0;
    U32 record = 0;
    unsigned type = 255;
    bool operator==(const Snapshot& b) const {
        return status == b.status && slot == b.slot && flags == b.flags && record == b.record && type==b.type;
    }
};

struct JournalEntry {
    unsigned group;
    U32 object;
    std::array<unsigned char,0x30> data;
    std::array<unsigned char,424> definition;
    bool operator==(const JournalEntry& b) const {
        return group==b.group && object==b.object && data==b.data && definition==b.definition;
    }
};

// Candidate layout reconstructed from the original Bagnon; no client functions called.
template<class Reader>
Snapshot Observe(Reader& read, U32 targetCode = TargetCode,
                 const std::array<unsigned char, 424>& expectedRecord = Profile::Record,
                 std::vector<JournalEntry>* journal = nullptr) {
    if (journal) journal->clear();
    auto unknown = [&](const char* reason) {
        if (journal) journal->clear();
        Snapshot s; s.status = reason; return s;
    };
    U32 manager = 0;
    if (!read(ManagerPointer, &manager, 4) || !manager) return unknown("MANAGER_UNAVAILABLE");
    std::array<unsigned char, 0x10> managerData{};
    if (!read(manager, managerData.data(), managerData.size())) return unknown("MANAGER_UNREADABLE");
    if (Word(managerData.data(), 0) != 0x00A47494) return unknown("LAYOUT_UNCONFIRMED");
    U32 list = Word(managerData.data(), 0x0c);
    std::array<unsigned char, 0x34> groups{};
    if (!list || !read(list, groups.data(), groups.size())) return unknown("LIST_UNAVAILABLE");
    Snapshot result;
    char label[16]; std::snprintf(label, sizeof(label), "Q%06X", targetCode & 0xffffff);
    result.status = journal ? "JOURNAL_OBSERVED" : std::string(label) + "_NOT_OBSERVED";
    unsigned found = 0;
    for (unsigned group = 0; group < 3; ++group) {
        size_t base = 4 + group * 0x10;
        U32 items = Word(groups.data(), base);
        unsigned count = groups[base + 4];
        U32 active = Word(groups.data(), base + 8);
        if (!active || !count) continue;
        if (!items) return unknown("LIST_INCONSISTENT");
        std::array<U32, 255> pointers{};
        if (!read(items, pointers.data(), count * 4)) return unknown("ITEMS_UNREADABLE");
        for (unsigned i = 0; i < count; ++i) {
            U32 item = pointers[i], object = 0;
            if (!item) continue;
            if (item > UINT32_MAX - 0x248 || !read(item + 0x248, &object, 4))
                return unknown("OBJECT_UNREADABLE");
            if (!object) continue;
            std::array<unsigned char, 0x30> data{};
            if (!read(object, data.data(), data.size())) return unknown("OBJECT_UNREADABLE");
            if (Word(data.data(), 0) != 0x00A45B1C) return unknown("QUEST_LAYOUT_UNCONFIRMED");
            U32 record = Word(data.data(), 0x10);
            std::array<unsigned char, 424> definition{};
            if (!record || !read(record, definition.data(), definition.size()))
                return unknown("RECORD_UNREADABLE");
            if (!journal && Word(definition.data(), 4) != targetCode) continue;
            if (!journal && definition != expectedRecord)
                return unknown("TARGET_LAYOUT_MISMATCH");
            std::array<unsigned char, 0x30> again{};
            std::array<unsigned char, 424> definitionAgain{};
            U32 objectAgain=0;
            if (!read(item+0x248,&objectAgain,4) || objectAgain!=object ||
                !read(object, again.data(), again.size()) || again != data ||
                !read(record,definitionAgain.data(),definitionAgain.size()) || definitionAgain!=definition)
                return unknown("CHANGING_SAMPLE");
            if (journal) {
                for (const auto& entry : *journal)
                    if (entry.object==object) return unknown("AMBIGUOUS_LIST");
                journal->push_back({group,object,data,definition});
                continue;
            }
            result.status = std::string(label) + "_PRESENT";
            result.slot = data[0x18];
            result.flags = Word(data.data(), 0x28);
            result.record = record;
            result.type = data[0x19];
            ++found;
        }
        std::array<U32, 255> again{};
        if (!read(items, again.data(), count * 4) || again != pointers)
            return unknown("CHANGING_SAMPLE");
    }
    U32 managerAgain = 0;
    std::array<unsigned char, 0x10> managerDataAgain{};
    std::array<unsigned char, 0x34> groupsAgain{};
    if (!read(ManagerPointer, &managerAgain, 4) || managerAgain != manager ||
        !read(manager, managerDataAgain.data(), managerDataAgain.size()) || managerDataAgain != managerData ||
        !read(list, groupsAgain.data(), groupsAgain.size()) || groupsAgain != groups)
        return unknown("CHANGING_SAMPLE");
    if (found > 1) return unknown("AMBIGUOUS_TARGET");
    // shortcut: polling cannot establish completion or catch every short-lived quest.
    // Upgrade to an event observer only after the loaded handler and ABI are validated.
    return result;
}
}
